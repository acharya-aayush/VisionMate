export type BoundingBox = [number, number, number, number];

export interface DetectionInput {
  bbox: BoundingBox;
  score: number;
  label: string;
}

export interface TrackedObject extends DetectionInput {
  trackId: number;
  age: number;
  misses: number;
  hits: number;
}

interface TrackerOptions {
  iouThreshold?: number;
  maxMisses?: number;
  minHits?: number;
  smoothing?: number;
}

const iou = (a: BoundingBox, b: BoundingBox): number => {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[2], b[2]);
  const y2 = Math.min(a[3], b[3]);

  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const intersection = interW * interH;
  if (intersection <= 0) return 0;

  const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1]);
  const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  const union = areaA + areaB - intersection;
  if (union <= 0) return 0;

  return intersection / union;
};

const smoothBox = (oldBox: BoundingBox, newBox: BoundingBox, alpha: number): BoundingBox => {
  const inv = 1 - alpha;
  return [
    oldBox[0] * inv + newBox[0] * alpha,
    oldBox[1] * inv + newBox[1] * alpha,
    oldBox[2] * inv + newBox[2] * alpha,
    oldBox[3] * inv + newBox[3] * alpha,
  ];
};

export class SimpleSortTracker {
  private tracks: TrackedObject[] = [];
  private nextTrackId = 1;
  private readonly iouThreshold: number;
  private readonly maxMisses: number;
  private readonly minHits: number;
  private readonly smoothing: number;

  constructor(options: TrackerOptions = {}) {
    this.iouThreshold = options.iouThreshold ?? 0.3;
    this.maxMisses = options.maxMisses ?? 8;
    this.minHits = options.minHits ?? 2;
    this.smoothing = options.smoothing ?? 0.35;
  }

  reset(): void {
    this.tracks = [];
    this.nextTrackId = 1;
  }

  update(detections: DetectionInput[]): TrackedObject[] {
    const unmatchedDetections = new Set<number>(detections.map((_, index) => index));
    const unmatchedTracks = new Set<number>(this.tracks.map((_, index) => index));
    const matches: Array<{ trackIndex: number; detectionIndex: number }> = [];

    // Greedy IoU matching for low-latency mobile tracking.
    while (unmatchedDetections.size > 0 && unmatchedTracks.size > 0) {
      let bestScore = 0;
      let bestTrackIndex = -1;
      let bestDetectionIndex = -1;

      for (const trackIndex of unmatchedTracks) {
        for (const detectionIndex of unmatchedDetections) {
          const score = iou(this.tracks[trackIndex].bbox, detections[detectionIndex].bbox);
          if (score > bestScore) {
            bestScore = score;
            bestTrackIndex = trackIndex;
            bestDetectionIndex = detectionIndex;
          }
        }
      }

      if (bestScore < this.iouThreshold || bestTrackIndex < 0 || bestDetectionIndex < 0) {
        break;
      }

      matches.push({ trackIndex: bestTrackIndex, detectionIndex: bestDetectionIndex });
      unmatchedTracks.delete(bestTrackIndex);
      unmatchedDetections.delete(bestDetectionIndex);
    }

    for (const { trackIndex, detectionIndex } of matches) {
      const detection = detections[detectionIndex];
      const track = this.tracks[trackIndex];

      track.bbox = smoothBox(track.bbox, detection.bbox, this.smoothing);
      track.label = detection.label;
      track.score = detection.score;
      track.hits += 1;
      track.age += 1;
      track.misses = 0;
    }

    for (const trackIndex of unmatchedTracks) {
      const track = this.tracks[trackIndex];
      track.misses += 1;
      track.age += 1;
    }

    for (const detectionIndex of unmatchedDetections) {
      const detection = detections[detectionIndex];
      this.tracks.push({
        ...detection,
        trackId: this.nextTrackId,
        age: 1,
        misses: 0,
        hits: 1,
      });
      this.nextTrackId += 1;
    }

    this.tracks = this.tracks.filter((track) => track.misses <= this.maxMisses);

    return this.tracks.filter((track) => track.hits >= this.minHits || track.age <= 2);
  }
}
