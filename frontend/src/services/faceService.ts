import * as faceapi from 'face-api.js';

let modelsLoading: Promise<void> | null = null;

export type FaceDetection = faceapi.WithFaceDescriptor<
  faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>
>;

export type DetectionAnalysis = {
  detections: FaceDetection[];
  resizedDetections: FaceDetection[];
};

export const loadFaceModels = async (baseUrl: string = '/models') => {
  if (!modelsLoading) {
    modelsLoading = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(baseUrl),
      faceapi.nets.faceLandmark68Net.loadFromUri(baseUrl),
      faceapi.nets.faceRecognitionNet.loadFromUri(baseUrl),
    ]).then(() => undefined);
  }
  return modelsLoading;
};

export const detectFaces = async (
  video: HTMLVideoElement,
  baseUrl: string = '/models'
): Promise<DetectionAnalysis> => {
  await loadFaceModels(baseUrl);
  const detections = await faceapi
    .detectAllFaces(
      video,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
    )
    .withFaceLandmarks()
    .withFaceDescriptors();

  const displaySize = {
    width: video.videoWidth,
    height: video.videoHeight,
  };
  const resizedDetections = faceapi.resizeResults(detections, displaySize);
  return { detections, resizedDetections };
};

export const computeAverageBrightness = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
) => {
  const sampleSize = 64;
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = sampleSize;
  sampleCanvas.height = sampleSize;
  const sampleCtx = sampleCanvas.getContext('2d');
  if (!sampleCtx) return 0;
  sampleCtx.drawImage(ctx.canvas, 0, 0, width, height, 0, 0, sampleSize, sampleSize);
  const { data } = sampleCtx.getImageData(0, 0, sampleSize, sampleSize);
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    total += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  return total / (data.length / 4);
};

export const isFaceCentered = (
  box: faceapi.Box,
  frameWidth: number,
  frameHeight: number,
  tolerance: number = 0.2
) => {
  const faceCenterX = box.x + box.width / 2;
  const faceCenterY = box.y + box.height / 2;
  const centerX = frameWidth / 2;
  const centerY = frameHeight / 2;
  const maxOffsetX = frameWidth * tolerance;
  const maxOffsetY = frameHeight * tolerance;
  return Math.abs(faceCenterX - centerX) <= maxOffsetX && Math.abs(faceCenterY - centerY) <= maxOffsetY;
};

export const drawFaceBox = (
  ctx: CanvasRenderingContext2D,
  box: faceapi.Box,
  color: string
) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect(box.x, box.y, box.width, box.height);
};
