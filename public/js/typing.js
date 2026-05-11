export class TypingEngine {
  constructor() {
    this.reset();
  }

  static DISPLAY_LINES_PER_PAGE = 2;
  static DEFAULT_DISPLAY_LINE_MAX_CHARS = 72;
  static MIN_DISPLAY_LINE_MAX_CHARS = 24;
  static MAX_DISPLAY_LINE_MAX_CHARS = 180;

  setText(text) {
    this.text = text;
    this.segments = this.buildSegments(text);
    this.displayLines = this.buildDisplayLines(text);
    this.typed = '';
    this.totalKeys = 0;
    this.mistakes = 0;
    this.correctKeys = 0;
    this.streak = 0;
    this.longestStreak = 0;
    this.startedAt = null;
    this.lastInputAt = null;
    this.lastCorrectInputAt = null;
  }

  setDisplayLineMaxChars(value) {
    const nextValue = Math.max(
      TypingEngine.MIN_DISPLAY_LINE_MAX_CHARS,
      Math.min(TypingEngine.MAX_DISPLAY_LINE_MAX_CHARS, Math.round(Number(value) || 0))
    );

    if (this.displayLineMaxChars === nextValue) {
      return false;
    }

    this.displayLineMaxChars = nextValue;

    if (this.text) {
      this.displayLines = this.buildDisplayLines(this.text);
    }

    return true;
  }

  start(startTime) {
    this.startedAt = startTime || Date.now();
    this.lastInputAt = Date.now();
    this.lastCorrectInputAt = this.startedAt;
  }

  handleInput(char) {
    const expected = this.text[this.typed.length];
    if (!expected) {
      return { accepted: false, correct: false, finished: true };
    }

    const previousSegmentIndex = this.getSegmentIndexForLength(this.typed.length);
    const now = Date.now();
    const previousInputAt = this.lastInputAt || this.startedAt || now;
    const previousCorrectInputAt = this.lastCorrectInputAt || this.startedAt || now;
    const keyIntervalMs = Math.max(0, now - previousInputAt);
    const correctKeyIntervalMs = Math.max(0, now - previousCorrectInputAt);
    this.lastInputAt = now;
    this.totalKeys += 1;
    const correct = char.toLowerCase() === expected.toLowerCase();
    if (correct) {
      this.typed += char;
      this.correctKeys += 1;
      this.streak += 1;
      this.longestStreak = Math.max(this.longestStreak, this.streak);
      this.lastCorrectInputAt = now;
    } else {
      this.mistakes += 1;
      this.streak = 0;
    }
    const nextSegmentIndex = this.getSegmentIndexForLength(this.typed.length);

    return {
      accepted: true,
      correct,
      keyIntervalMs: correct ? correctKeyIntervalMs : keyIntervalMs,
      segmentChanged: correct && nextSegmentIndex > previousSegmentIndex,
      finished: this.typed.length >= this.text.length
    };
  }

  getDisplay() {
    const segment = this.getActiveSegment();

    return {
      typed: segment.typed,
      current: segment.current,
      remaining: segment.remaining,
      segmentIndex: segment.index,
      segmentCount: segment.count || this.segments.length
    };
  }

  getStats() {
    const elapsedMinutes = this.startedAt
      ? Math.max((Date.now() - this.startedAt) / 60000, 1 / 60000)
      : 1 / 60000;

    return {
      wpm: Math.round((this.typed.length / 5) / elapsedMinutes),
      accuracy: Math.max(
        0,
        Math.round(((this.totalKeys - this.mistakes) / Math.max(1, this.totalKeys)) * 100)
      ),
      mistakes: this.mistakes,
      totalKeys: this.totalKeys,
      correctKeys: this.correctKeys,
      streak: this.streak,
      longestStreak: this.longestStreak,
      progress: this.text.length
        ? Math.round((this.typed.length / this.text.length) * 100)
        : 0
    };
  }

  reset() {
    this.text = '';
    this.segments = [];
    this.displayLines = [];
    this.displayLineMaxChars = TypingEngine.DEFAULT_DISPLAY_LINE_MAX_CHARS;
    this.typed = '';
    this.totalKeys = 0;
    this.mistakes = 0;
    this.correctKeys = 0;
    this.streak = 0;
    this.longestStreak = 0;
    this.startedAt = null;
    this.lastInputAt = null;
    this.lastCorrectInputAt = null;
  }

  buildSegments(text) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    const segments = [];
    let start = 0;
    let current = '';

    words.forEach((word) => {
      const next = current ? `${current} ${word}` : word;

      if (next.length > 72 && current) {
        segments.push({
          start,
          end: start + current.length,
          text: current
        });
        start += current.length + 1;
        current = word;
        return;
      }

      current = next;
    });

    if (current) {
      segments.push({
        start,
        end: start + current.length,
        text: current
      });
    }

    return segments;
  }

  buildDisplayLines(text) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let start = 0;
    let current = '';

    words.forEach((word) => {
      const next = current ? `${current} ${word}` : word;

      if (next.length > this.displayLineMaxChars && current) {
        lines.push({
          start,
          end: start + current.length,
          text: current
        });
        start += current.length + 1;
        current = word;
        return;
      }

      current = next;
    });

    if (current) {
      lines.push({
        start,
        end: start + current.length,
        text: current
      });
    }

    return lines;
  }

  getActiveSegment() {
    const displayLines = this.displayLines?.length ? this.displayLines : this.segments;

    if (!displayLines.length) {
      return {
        typed: this.typed,
        current: this.text[this.typed.length] || '',
        remaining: this.text.slice(this.typed.length + 1),
        index: 0
      };
    }

    const typedLength = this.typed.length;
    const lineIndex = displayLines.findIndex((line) => typedLength <= line.end);
    const index = lineIndex === -1 ? displayLines.length - 1 : lineIndex;
    const pageLines = displayLines.slice(
      index,
      index + TypingEngine.DISPLAY_LINES_PER_PAGE
    );

    let typed = '';
    let current = '';
    let remaining = '';

    pageLines.forEach((line, lineOffset) => {
      const separator = lineOffset > 0 ? '\n' : '';

      if (typedLength > line.end) {
        typed += `${separator}${line.text}`;
        return;
      }

      if (typedLength < line.start) {
        remaining += `${separator}${line.text}`;
        return;
      }

      const localIndex = Math.max(0, Math.min(line.text.length, typedLength - line.start));
      const isWaitingForLineSpace = localIndex >= line.text.length && this.text[typedLength] === ' ';

      typed += `${separator}${line.text.slice(0, localIndex)}`;
      current = isWaitingForLineSpace ? ' ' : line.text[localIndex] || '';

      if (!isWaitingForLineSpace) {
        remaining += line.text.slice(localIndex + 1);
      }
    });

    return {
      typed,
      current,
      remaining,
      index,
      count: displayLines.length
    };
  }

  getSegmentIndexForLength(length) {
    if (!this.segments.length) {
      return 0;
    }

    const index = this.segments.findIndex((segment) => length <= segment.end);
    return index === -1 ? this.segments.length - 1 : index;
  }
}
