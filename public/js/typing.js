export class TypingEngine {
  constructor() {
    this.reset();
  }

  setText(text) {
    this.text = text;
    this.segments = this.buildSegments(text);
    this.typed = '';
    this.totalKeys = 0;
    this.mistakes = 0;
    this.startedAt = null;
    this.lastInputAt = null;
    this.lastCorrectInputAt = null;
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
      this.lastCorrectInputAt = now;
    } else {
      this.mistakes += 1;
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
      segmentCount: this.segments.length
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
      progress: this.text.length
        ? Math.round((this.typed.length / this.text.length) * 100)
        : 0
    };
  }

  reset() {
    this.text = '';
    this.segments = [];
    this.typed = '';
    this.totalKeys = 0;
    this.mistakes = 0;
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

  getActiveSegment() {
    if (!this.segments.length) {
      return {
        typed: this.typed,
        current: this.text[this.typed.length] || '',
        remaining: this.text.slice(this.typed.length + 1),
        index: 0
      };
    }

    const typedLength = this.typed.length;
    const segmentIndex = this.segments.findIndex((segment) => typedLength <= segment.end);
    const index = segmentIndex === -1 ? this.segments.length - 1 : segmentIndex;
    const segment = this.segments[index];
    const localIndex = Math.max(0, Math.min(segment.text.length, typedLength - segment.start));
    const isWaitingForSegmentSpace = localIndex >= segment.text.length && this.text[typedLength] === ' ';

    return {
      typed: segment.text.slice(0, localIndex),
      current: isWaitingForSegmentSpace ? ' ' : segment.text[localIndex] || '',
      remaining: segment.text.slice(localIndex + 1),
      index
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
