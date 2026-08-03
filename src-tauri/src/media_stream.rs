use crate::tdlib::{send_request, AppState};
use serde_json::{json, Value};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::sync::{Arc, Mutex};
use tauri::http::{
    header::{ACCEPT_RANGES, CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE, RANGE},
    Request, Response, StatusCode,
};
use tauri::{AppHandle, Manager, Runtime, UriSchemeResponder};

const STREAM_CHUNK_SIZE: u64 = 1024 * 1024;

pub fn respond<R: Runtime>(
    app: AppHandle<R>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    std::thread::spawn(move || {
        let response = stream_response(&app, request).unwrap_or_else(error_response);
        responder.respond(response);
    });
}

fn stream_response<R: Runtime>(
    app: &AppHandle<R>,
    request: Request<Vec<u8>>,
) -> Result<Response<Vec<u8>>, String> {
    let file_id = request
        .uri()
        .path()
        .trim_start_matches('/')
        .parse::<i32>()
        .map_err(|_| "Invalid TDLib file id".to_string())?;
    let content_type = request
        .uri()
        .query()
        .and_then(|query| query.split('&').find_map(|part| part.strip_prefix("mime=")))
        .filter(|value| value.starts_with("video/"))
        .unwrap_or("video/mp4")
        .to_string();

    let state = app.state::<AppState>();
    // 只对“同一 file_id”的流式请求加互斥锁，避免并发下载同一文件产生冲突的 range 请求；
    // 不同文件的视频流可并行，不再像全局锁那样把 tdstream:// 请求全部串行化。
    // lock（Arc）与 _stream_guard 都是本函数作用域内的绑定：guard 借用 lock 保持有效，
    // 取到 guard 后立即 drop(map)，避免持有 map 锁的同时阻塞等待 per-file 锁。
    let mut stream_lock_map = state.stream_locks.lock().map_err(|e| e.to_string())?;
    let lock = stream_lock_map
        .entry(file_id)
        .or_insert_with(|| Arc::new(Mutex::new(())))
        .clone();
    let _stream_guard = lock.lock().map_err(|e| e.to_string())?;
    drop(stream_lock_map);
    let file = tdlib_request(&state, json!({ "_": "getFile", "file_id": file_id }))?;
    let total = file_size(&file).ok_or_else(|| "TDLib file size is unknown".to_string())?;
    let (start, requested_end) = parse_range(
        request
            .headers()
            .get(RANGE)
            .and_then(|value| value.to_str().ok()),
        total,
    )?;
    let end = requested_end.min(start + STREAM_CHUNK_SIZE - 1);
    let count = end - start + 1;

    let downloaded = tdlib_request(
        &state,
        json!({
            "_": "downloadFile",
            "file_id": file_id,
            "priority": 32,
            "offset": start,
            "limit": count,
            "synchronous": true
        }),
    )?;
    let path = downloaded
        .pointer("/local/path")
        .and_then(Value::as_str)
        .filter(|path| !path.is_empty())
        .ok_or_else(|| "TDLib didn't provide a local file path".to_string())?;

    let mut source = File::open(path).map_err(|e| e.to_string())?;
    source
        .seek(SeekFrom::Start(start))
        .map_err(|e| e.to_string())?;
    let mut body = vec![0; count as usize];
    source.read_exact(&mut body).map_err(|e| e.to_string())?;

    Response::builder()
        .status(StatusCode::PARTIAL_CONTENT)
        .header(CONTENT_TYPE, content_type)
        .header(ACCEPT_RANGES, "bytes")
        .header(CONTENT_RANGE, format!("bytes {start}-{end}/{total}"))
        .header(CONTENT_LENGTH, count)
        .header("Access-Control-Allow-Origin", "*")
        .body(body)
        .map_err(|e| e.to_string())
}

fn tdlib_request(state: &AppState, request: Value) -> Result<Value, String> {
    let response = tauri::async_runtime::block_on(send_request(state, request))?;
    if response.get("_").and_then(Value::as_str) == Some("error") {
        return Err(response
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("TDLib request failed")
            .to_string());
    }
    Ok(response)
}

fn file_size(file: &Value) -> Option<u64> {
    file.get("size")
        .and_then(Value::as_u64)
        .filter(|size| *size > 0)
        .or_else(|| {
            file.get("expected_size")
                .and_then(Value::as_u64)
                .filter(|size| *size > 0)
        })
}

fn parse_range(header: Option<&str>, total: u64) -> Result<(u64, u64), String> {
    if total == 0 {
        return Err("TDLib file size is unknown".to_string());
    }
    let Some(value) = header.and_then(|value| value.strip_prefix("bytes=")) else {
        return Ok((0, total - 1));
    };
    if value.contains(',') {
        return Err("Multiple byte ranges aren't supported".to_string());
    }
    let (start, end) = value
        .split_once('-')
        .ok_or_else(|| "Invalid byte range".to_string())?;
    if start.is_empty() {
        let suffix = end
            .parse::<u64>()
            .map_err(|_| "Invalid byte range".to_string())?;
        if suffix == 0 {
            return Err("Invalid byte range".to_string());
        }
        return Ok((total.saturating_sub(suffix), total - 1));
    }

    let start = start
        .parse::<u64>()
        .map_err(|_| "Invalid byte range".to_string())?;
    let end = if end.is_empty() {
        total - 1
    } else {
        end.parse::<u64>()
            .map_err(|_| "Invalid byte range".to_string())?
            .min(total - 1)
    };
    if start >= total || end < start {
        return Err("Requested byte range isn't satisfiable".to_string());
    }
    Ok((start, end))
}

fn error_response(message: String) -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::BAD_REQUEST)
        .header(CONTENT_TYPE, "text/plain; charset=utf-8")
        .header("Access-Control-Allow-Origin", "*")
        .body(message.into_bytes())
        .expect("static stream error response must be valid")
}

#[cfg(test)]
mod tests {
    use super::parse_range;

    #[test]
    fn parses_media_byte_ranges() {
        assert_eq!(parse_range(Some("bytes=0-"), 10).unwrap(), (0, 9));
        assert_eq!(parse_range(Some("bytes=3-7"), 10).unwrap(), (3, 7));
        assert_eq!(parse_range(Some("bytes=-4"), 10).unwrap(), (6, 9));
        assert_eq!(parse_range(None, 10).unwrap(), (0, 9));
    }

    #[test]
    fn rejects_unsatisfiable_ranges() {
        assert!(parse_range(Some("bytes=10-"), 10).is_err());
        assert!(parse_range(Some("bytes=7-3"), 10).is_err());
        assert!(parse_range(Some("bytes=0-1,4-5"), 10).is_err());
    }
}
