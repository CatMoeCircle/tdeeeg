export interface MediaGroupSize {
  width: number;
  height: number;
}

export interface MediaGroupRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MediaGroupLayout {
  width: number;
  height: number;
  items: MediaGroupRect[];
}

interface LayoutContext {
  ratios: number[];
  proportions: string;
  count: number;
  maxWidth: number;
  maxHeight: number;
  minWidth: number;
  spacing: number;
  averageRatio: number;
}

interface LayoutAttempt {
  lineCounts: number[];
  heights: number[];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function safeSize(size: MediaGroupSize): MediaGroupSize {
  return {
    width: Math.max(1, size.width || 1),
    height: Math.max(1, size.height || 1),
  };
}

function finishLayout(items: MediaGroupRect[], width: number): MediaGroupLayout {
  return {
    width,
    height: Math.max(1, ...items.map((item) => item.y + item.height)),
    items,
  };
}

function layoutTwo(context: LayoutContext): MediaGroupRect[] {
  const { ratios, proportions, maxWidth, maxHeight, minWidth, spacing, averageRatio } = context;
  if (proportions === "ww" && averageRatio > 1.4 && Math.abs(ratios[1] - ratios[0]) < 0.2) {
    const height = Math.round(Math.min(
      maxWidth / ratios[0],
      maxWidth / ratios[1],
      (maxHeight - spacing) / 2,
    ));
    return [
      { x: 0, y: 0, width: maxWidth, height },
      { x: 0, y: height + spacing, width: maxWidth, height },
    ];
  }
  if (proportions === "ww" || proportions === "qq") {
    const width = Math.floor((maxWidth - spacing) / 2);
    const height = Math.round(Math.min(width / ratios[0], width / ratios[1], maxHeight));
    return [
      { x: 0, y: 0, width, height },
      { x: width + spacing, y: 0, width: maxWidth - width - spacing, height },
    ];
  }

  const minimalWidth = Math.round(minWidth * 1.5);
  const secondWidth = Math.min(
    Math.round(Math.max(
      0.4 * (maxWidth - spacing),
      (maxWidth - spacing) / ratios[0] / (1 / ratios[0] + 1 / ratios[1]),
    )),
    maxWidth - spacing - minimalWidth,
  );
  const firstWidth = maxWidth - secondWidth - spacing;
  const height = Math.min(
    maxHeight,
    Math.round(Math.min(firstWidth / ratios[0], secondWidth / ratios[1])),
  );
  return [
    { x: 0, y: 0, width: firstWidth, height },
    { x: firstWidth + spacing, y: 0, width: secondWidth, height },
  ];
}

function layoutThree(context: LayoutContext): MediaGroupRect[] {
  const { ratios, proportions, maxWidth, maxHeight, minWidth, spacing } = context;
  if (proportions[0] === "n") {
    const firstHeight = maxHeight;
    const thirdHeight = Math.round(Math.min(
      (maxHeight - spacing) / 2,
      ratios[1] * (maxWidth - spacing) / (ratios[2] + ratios[1]),
    ));
    const secondHeight = firstHeight - thirdHeight - spacing;
    const rightWidth = Math.max(
      minWidth,
      Math.round(Math.min(
        (maxWidth - spacing) / 2,
        thirdHeight * ratios[2],
        secondHeight * ratios[1],
      )),
    );
    const leftWidth = Math.min(
      Math.round(firstHeight * ratios[0]),
      maxWidth - spacing - rightWidth,
    );
    return [
      { x: 0, y: 0, width: leftWidth, height: firstHeight },
      { x: leftWidth + spacing, y: 0, width: rightWidth, height: secondHeight },
      { x: leftWidth + spacing, y: secondHeight + spacing, width: rightWidth, height: thirdHeight },
    ];
  }

  const firstHeight = Math.round(Math.min(
    maxWidth / ratios[0],
    (maxHeight - spacing) * 0.66,
  ));
  const secondWidth = Math.floor((maxWidth - spacing) / 2);
  const secondHeight = Math.min(
    maxHeight - firstHeight - spacing,
    Math.round(Math.min(secondWidth / ratios[1], secondWidth / ratios[2])),
  );
  return [
    { x: 0, y: 0, width: maxWidth, height: firstHeight },
    { x: 0, y: firstHeight + spacing, width: secondWidth, height: secondHeight },
    {
      x: secondWidth + spacing,
      y: firstHeight + spacing,
      width: maxWidth - secondWidth - spacing,
      height: secondHeight,
    },
  ];
}

function layoutFour(context: LayoutContext): MediaGroupRect[] {
  const { ratios, proportions, maxWidth, maxHeight, minWidth, spacing } = context;
  if (proportions[0] === "w") {
    const firstHeight = Math.round(Math.min(
      maxWidth / ratios[0],
      (maxHeight - spacing) * 0.66,
    ));
    const rowHeight = Math.round(
      (maxWidth - 2 * spacing) / (ratios[1] + ratios[2] + ratios[3]),
    );
    const firstWidth = Math.max(
      minWidth,
      Math.round(Math.min((maxWidth - 2 * spacing) * 0.4, rowHeight * ratios[1])),
    );
    const thirdWidth = Math.round(Math.max(
      minWidth,
      (maxWidth - 2 * spacing) * 0.33,
      rowHeight * ratios[3],
    ));
    const secondWidth = maxWidth - firstWidth - thirdWidth - 2 * spacing;
    const height = Math.min(maxHeight - firstHeight - spacing, rowHeight);
    return [
      { x: 0, y: 0, width: maxWidth, height: firstHeight },
      { x: 0, y: firstHeight + spacing, width: firstWidth, height },
      { x: firstWidth + spacing, y: firstHeight + spacing, width: secondWidth, height },
      {
        x: firstWidth + secondWidth + 2 * spacing,
        y: firstHeight + spacing,
        width: thirdWidth,
        height,
      },
    ];
  }

  const firstWidth = Math.round(Math.min(
    maxHeight * ratios[0],
    (maxWidth - spacing) * 0.6,
  ));
  const rightWidth = Math.round(
    (maxHeight - 2 * spacing) / (1 / ratios[1] + 1 / ratios[2] + 1 / ratios[3]),
  );
  const firstHeight = Math.round(rightWidth / ratios[1]);
  const secondHeight = Math.round(rightWidth / ratios[2]);
  const thirdHeight = maxHeight - firstHeight - secondHeight - 2 * spacing;
  const width = Math.max(minWidth, Math.min(maxWidth - firstWidth - spacing, rightWidth));
  return [
    { x: 0, y: 0, width: firstWidth, height: maxHeight },
    { x: firstWidth + spacing, y: 0, width, height: firstHeight },
    { x: firstWidth + spacing, y: firstHeight + spacing, width, height: secondHeight },
    {
      x: firstWidth + spacing,
      y: firstHeight + secondHeight + 2 * spacing,
      width,
      height: thirdHeight,
    },
  ];
}

function layoutComplex(context: LayoutContext): MediaGroupRect[] {
  const { count, maxWidth, minWidth, spacing, averageRatio } = context;
  const maxHeight = maxWidth * 4 / 3;
  const ratios = context.ratios.map((ratio) => averageRatio > 1.1
    ? clamp(ratio, 1, 2.75)
    : clamp(ratio, 0.6667, 1));
  const attempts: LayoutAttempt[] = [];

  const addAttempt = (lineCounts: number[]) => {
    let offset = 0;
    const heights = lineCounts.map((lineCount) => {
      const ratioSum = ratios.slice(offset, offset + lineCount)
        .reduce((sum, ratio) => sum + ratio, 0);
      offset += lineCount;
      return (maxWidth - (lineCount - 1) * spacing) / ratioSum;
    });
    attempts.push({ lineCounts, heights });
  };

  for (let first = 1; first < count; first += 1) {
    const second = count - first;
    if (first <= 3 && second <= 3) addAttempt([first, second]);
  }
  for (let first = 1; first < count - 1; first += 1) {
    for (let second = 1; second < count - first; second += 1) {
      const third = count - first - second;
      if (first <= 3 && second <= (averageRatio < 0.85 ? 4 : 3) && third <= 3) {
        addAttempt([first, second, third]);
      }
    }
  }
  for (let first = 1; first < count - 2; first += 1) {
    for (let second = 1; second < count - first - 1; second += 1) {
      for (let third = 1; third < count - first - second; third += 1) {
        const fourth = count - first - second - third;
        if (first <= 3 && second <= 3 && third <= 3 && fourth <= 3) {
          addAttempt([first, second, third, fourth]);
        }
      }
    }
  }

  const attemptScore = (attempt: LayoutAttempt): number => {
    const totalHeight = attempt.heights.reduce((sum, height) => sum + height, 0)
      + spacing * (attempt.heights.length - 1);
    const hasShortLine = Math.min(...attempt.heights) < minWidth;
    const hasShrinkingRows = attempt.lineCounts.some((lineCount, index) => (
      index > 0 && attempt.lineCounts[index - 1] > lineCount
    ));
    return Math.abs(totalHeight - maxHeight)
      * (hasShortLine ? 1.5 : 1)
      * (hasShrinkingRows ? 1.5 : 1);
  };
  const optimal = attempts.reduce<LayoutAttempt | null>((best, attempt) => {
    if (!best) return attempt;
    return attemptScore(attempt) < attemptScore(best) ? attempt : best;
  }, null);

  if (!optimal) return [];
  const result: MediaGroupRect[] = [];
  let index = 0;
  let y = 0;
  optimal.lineCounts.forEach((columnCount, row) => {
    const lineHeight = optimal.heights[row];
    const height = Math.round(lineHeight);
    let x = 0;
    for (let column = 0; column < columnCount; column += 1) {
      const width = column === columnCount - 1
        ? maxWidth - x
        : Math.round(ratios[index] * lineHeight);
      result.push({ x, y: Math.round(y), width, height });
      x += width + spacing;
      index += 1;
    }
    y += lineHeight + spacing;
  });
  return result;
}

/** Telegram Desktop Ui::LayoutMediaGroup 的媒体相册布局。 */
export function layoutMediaGroup(
  sourceSizes: readonly MediaGroupSize[],
  maxWidth = 380,
  minWidth = 90,
  spacing = 2,
): MediaGroupLayout {
  if (!sourceSizes.length) return { width: maxWidth, height: 1, items: [] };
  const sizes = sourceSizes.map(safeSize);
  const ratios = sizes.map(({ width, height }) => width / height);
  const proportions = ratios.map((ratio) => ratio > 1.2 ? "w" : ratio < 0.8 ? "n" : "q").join("");
  const context: LayoutContext = {
    ratios,
    proportions,
    count: sizes.length,
    maxWidth,
    maxHeight: maxWidth,
    minWidth,
    spacing,
    averageRatio: (1 + ratios.reduce((sum, ratio) => sum + ratio, 0)) / sizes.length,
  };

  let items: MediaGroupRect[];
  if (sizes.length === 1) {
    items = [{
      x: 0,
      y: 0,
      width: maxWidth,
      height: Math.round(sizes[0].height * maxWidth / sizes[0].width),
    }];
  } else if (sizes.length >= 5 || ratios.some((ratio) => ratio > 2)) {
    items = layoutComplex(context);
  } else if (sizes.length === 2) {
    items = layoutTwo(context);
  } else if (sizes.length === 3) {
    items = layoutThree(context);
  } else {
    items = layoutFour(context);
  }
  return finishLayout(items, maxWidth);
}
