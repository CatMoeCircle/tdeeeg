/**
 * AI 工具层：把注册表转成标准 function-calling 工具定义（OpenAI / DeepSeek 兼容）。
 * 将来接 AI 时直接把 toolsSchema() 的结果塞进请求的 tools 字段，不要另写一份手写 schema。
 */
import { TOOL_LIMITS } from "./limits.ts";
import { TOOLS, getTool } from "./registry.ts";
import type { ToolKind, ToolMeta, ToolParam, ToolParamType } from "./types.ts";

/** 用到的 JSON Schema 子集 */
export interface JsonSchema {
  type: string;
  description?: string;
  enum?: readonly string[];
  minimum?: number;
  maximum?: number;
  default?: number;
  maxItems?: number;
  items?: JsonSchema;
  additionalProperties?: boolean;
  properties?: Record<string, JsonSchema>;
  required?: string[];
}

/** 标准工具定义（tools 数组里的一项） */
export interface FunctionToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: JsonSchema;
  };
}

const JSON_TYPE: Record<ToolParamType, string> = {
  string: "string",
  number: "number",
  boolean: "boolean",
  "string[]": "array",
  "number[]": "array",
  object: "object",
};

const ITEM_TYPE: Partial<Record<ToolParamType, string>> = {
  "string[]": "string",
  "number[]": "number",
};

function paramSchema(tool: string, p: ToolParam): JsonSchema {
  const schema: JsonSchema = { type: JSON_TYPE[p.type], description: p.desc };
  const itemType = ITEM_TYPE[p.type];
  if (itemType) schema.items = { type: itemType };
  if (p.type === "object") schema.additionalProperties = true;
  if (p.maxItems !== undefined) schema.maxItems = p.maxItems;
  // limit 参数的上下界取自限额表，模型看到的默认值与硬顶跟 clampLimit 完全一致
  if (p.name === "limit") {
    const spec = (TOOL_LIMITS as Record<string, { def: number; cap: number }>)[tool];
    if (spec) {
      schema.minimum = 1;
      schema.maximum = spec.cap;
      schema.default = spec.def;
    }
  }
  return schema;
}

function toDef(meta: ToolMeta): FunctionToolDef {
  const required = meta.params.filter((p) => p.required).map((p) => p.name);
  return {
    type: "function",
    function: {
      name: meta.name,
      description: meta.desc,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: Object.fromEntries(meta.params.map((p) => [p.name, paramSchema(meta.name, p)])),
        ...(required.length ? { required } : {}),
      },
    },
  };
}

/** 单个工具的标准定义；工具不存在返回 undefined */
export function toolSchema(name: string): FunctionToolDef | undefined {
  const meta = getTool(name);
  return meta ? toDef(meta) : undefined;
}

/** 全部（或指定子集）工具的标准定义，按注册顺序 */
export function toolsSchema(names?: readonly string[]): FunctionToolDef[] {
  const metas = names
    ? names.map((n) => getTool(n)).filter((m): m is ToolMeta => m !== undefined)
    : TOOLS;
  return metas.map(toDef);
}

function namesOf(...kinds: ToolKind[]): string[] {
  return TOOLS.filter((t) => kinds.includes(t.kind)).map((t) => t.name);
}

/**
 * 按场景给模型的工具子集：
 * - readonly 只读问答（不给写工具，模型连审核都不会触发；本地元数据工具不碰 Telegram，照给）
 * - all      全量（含写工具；写调用一律先过审核）
 */
export const TOOLSETS = {
  readonly: namesOf("read", "local"),
  all: TOOLS.map((t) => t.name),
} as const;
