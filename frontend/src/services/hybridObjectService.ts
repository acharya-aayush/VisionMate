import * as ort from "onnxruntime-web";
import type { BoundingBox } from "@/lib/simpleSort";

const DEFAULT_MOBILENETV3_ONNX_URL =
  "https://github.com/onnx/models/raw/main/validated/vision/classification/mobilenet/model/mobilenetv3-small-1.0.onnx";

const MODEL_SIZE = 224;

class HybridObjectService {
  private session: ort.InferenceSession | null = null;
  private loadingPromise: Promise<ort.InferenceSession | null> | null = null;
  private scratchCanvas: HTMLCanvasElement | null = null;

  private async getSession(): Promise<ort.InferenceSession | null> {
    if (this.session) return this.session;
    if (this.loadingPromise) return this.loadingPromise;

    const modelUrl =
      import.meta.env.VITE_MOBILENETV3_ONNX_URL || DEFAULT_MOBILENETV3_ONNX_URL;

    this.loadingPromise = ort.InferenceSession.create(modelUrl, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    })
      .then((session) => {
        this.session = session;
        return session;
      })
      .catch((error) => {
        console.warn("ONNX session unavailable, using TensorFlow-only confidence", error);
        return null;
      });

    return this.loadingPromise;
  }

  private getCanvas(): HTMLCanvasElement {
    if (!this.scratchCanvas) {
      this.scratchCanvas = document.createElement("canvas");
      this.scratchCanvas.width = MODEL_SIZE;
      this.scratchCanvas.height = MODEL_SIZE;
    }

    return this.scratchCanvas;
  }

  private preprocess(video: HTMLVideoElement, bbox: BoundingBox): Float32Array {
    const [x1, y1, x2, y2] = bbox;
    const width = Math.max(8, x2 - x1);
    const height = Math.max(8, y2 - y1);

    const canvas = this.getCanvas();
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return new Float32Array(3 * MODEL_SIZE * MODEL_SIZE);
    }

    ctx.drawImage(video, x1, y1, width, height, 0, 0, MODEL_SIZE, MODEL_SIZE);
    const imageData = ctx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data;

    const input = new Float32Array(3 * MODEL_SIZE * MODEL_SIZE);
    const mean = [0.485, 0.456, 0.406];
    const std = [0.229, 0.224, 0.225];

    for (let i = 0; i < MODEL_SIZE * MODEL_SIZE; i += 1) {
      const r = imageData[i * 4] / 255;
      const g = imageData[i * 4 + 1] / 255;
      const b = imageData[i * 4 + 2] / 255;

      input[i] = (r - mean[0]) / std[0];
      input[i + MODEL_SIZE * MODEL_SIZE] = (g - mean[1]) / std[1];
      input[i + 2 * MODEL_SIZE * MODEL_SIZE] = (b - mean[2]) / std[2];
    }

    return input;
  }

  private softmaxMax(values: Float32Array): number {
    let maxLogit = -Infinity;
    for (let i = 0; i < values.length; i += 1) {
      if (values[i] > maxLogit) maxLogit = values[i];
    }

    let sum = 0;
    let maxProb = 0;
    for (let i = 0; i < values.length; i += 1) {
      const exp = Math.exp(values[i] - maxLogit);
      sum += exp;
      if (exp > maxProb) maxProb = exp;
    }

    if (sum <= 0) return 0;
    return maxProb / sum;
  }

  async scoreTrack(video: HTMLVideoElement, bbox: BoundingBox): Promise<number | null> {
    const session = await this.getSession();
    if (!session) return null;

    try {
      const inputData = this.preprocess(video, bbox);
      const tensor = new ort.Tensor("float32", inputData, [1, 3, MODEL_SIZE, MODEL_SIZE]);

      const inputName = session.inputNames[0];
      const outputName = session.outputNames[0];
      const results = await session.run({ [inputName]: tensor });
      const output = results[outputName];

      if (!output || !output.data || !(output.data instanceof Float32Array)) {
        return null;
      }

      return this.softmaxMax(output.data);
    } catch (error) {
      console.warn("ONNX scoring failed, using TensorFlow-only confidence", error);
      return null;
    }
  }
}

export const hybridObjectService = new HybridObjectService();
