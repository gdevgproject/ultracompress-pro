/**
 * UltraCompressPro v4.0.0 - Ultra Aggressive Compression
 * Optimized for 40% smaller files with perceptual quality preservation
 */

(function (global, factory) {
  if (typeof exports === "object" && typeof module !== "undefined") {
    module.exports = factory();
  } else if (typeof define === "function" && define.amd) {
    define([], factory);
  } else {
    global.UltraCompressPro = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const VERSION = "4.0.0";

  const CompressionQuality = {
    MAXIMUM: "maximum",
    HIGH: "high",
    BALANCED: "balanced",
    AGGRESSIVE: "aggressive",
    EXTREME: "extreme",
  };

  const ImageFormat = {
    JPEG: "image/jpeg",
    PNG: "image/png",
    WEBP: "image/webp",
    GIF: "image/gif",
    BMP: "image/bmp",
    TIFF: "image/tiff",
    SVG: "image/svg+xml",
  };

  const ProcessingStatus = {
    PENDING: "pending",
    PROCESSING: "processing",
    COMPLETED: "completed",
    FAILED: "failed",
    CANCELLED: "cancelled",
  };

  const EventType = {
    START: "start",
    PROGRESS: "progress",
    COMPLETE: "complete",
    ERROR: "error",
    CANCEL: "cancel",
    VERSION_COMPLETE: "version_complete",
    BATCH_START: "batch_start",
    BATCH_COMPLETE: "batch_complete",
  };

  // ==================== UTILITY FUNCTIONS ====================

  class ImageUtils {
    static detectMimeType(bytes) {
      const signatures = [
        { bytes: [0xff, 0xd8, 0xff], type: ImageFormat.JPEG },
        { bytes: [0x89, 0x50, 0x4e, 0x47], type: ImageFormat.PNG },
        { bytes: [0x47, 0x49, 0x46], type: ImageFormat.GIF },
        { bytes: [0x52, 0x49, 0x46, 0x46], type: ImageFormat.WEBP, offset: 0 },
        { bytes: [0x42, 0x4d], type: ImageFormat.BMP },
      ];

      for (const sig of signatures) {
        const offset = sig.offset || 0;
        if (bytes.length >= offset + sig.bytes.length) {
          if (sig.bytes.every((byte, i) => bytes[offset + i] === byte)) {
            return sig.type;
          }
        }
      }
      return "image/unknown";
    }

    static async isAnimated(file) {
      if (!file.type.includes("gif")) return false;
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let frameCount = 0;
      for (let i = 0; i < bytes.length - 1; i++) {
        if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9) {
          frameCount++;
          if (frameCount > 1) return true;
        }
      }
      return false;
    }

    static loadImage(file) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        const cleanup = () => URL.revokeObjectURL(url);
        img.onload = () => {
          cleanup();
          resolve(img);
        };
        img.onerror = () => {
          cleanup();
          reject(new Error("Failed to load image"));
        };
        img.src = url;
      });
    }

    static canvasToBlob(canvas, mimeType = ImageFormat.JPEG, quality = 0.9) {
      return new Promise((resolve, reject) => {
        if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
          return reject(new Error("Invalid canvas element"));
        }
        canvas.toBlob(
          (blob) =>
            blob ? resolve(blob) : reject(new Error("Failed to create blob")),
          mimeType,
          quality
        );
      });
    }

    static isWebPSupported() {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      return canvas.toDataURL("image/webp").indexOf("data:image/webp") === 0;
    }

    static calculateDimensions(
      width,
      height,
      maxDimension,
      targetAspectRatio = null
    ) {
      const currentAspect = width / height;
      let targetWidth, targetHeight;

      if (width > height) {
        targetWidth = Math.min(width, maxDimension);
        targetHeight = Math.round(targetWidth / currentAspect);
      } else {
        targetHeight = Math.min(height, maxDimension);
        targetWidth = Math.round(targetHeight * currentAspect);
      }

      if (targetAspectRatio) {
        const newAspect = targetWidth / targetHeight;
        if (Math.abs(newAspect - targetAspectRatio) > 0.01) {
          if (newAspect > targetAspectRatio) {
            targetWidth = Math.round(targetHeight * targetAspectRatio);
          } else {
            targetHeight = Math.round(targetWidth / targetAspectRatio);
          }
        }
      }

      return {
        width: targetWidth,
        height: targetHeight,
        sourceWidth: width,
        sourceHeight: height,
        scale: targetWidth / width,
        aspectRatio: targetWidth / targetHeight,
      };
    }
  }

  // ==================== IMAGE ANALYZER ====================

  class ImageAnalyzer {
    static async analyze(img, file) {
      const canvas = document.createElement("canvas");
      const sampleSize = Math.min(img.width, img.height, 200);
      canvas.width = canvas.height = sampleSize;

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, sampleSize, sampleSize);

      const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
      const data = imageData.data;

      const metrics = {
        edges: 0,
        variance: 0,
        transparentPixels: 0,
        colorFrequency: new Map(),
        brightnessSum: 0,
        saturationSum: 0,
      };

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

        if (a < 255) metrics.transparentPixels++;

        const colorKey = `${r},${g},${b}`;
        metrics.colorFrequency.set(
          colorKey,
          (metrics.colorFrequency.get(colorKey) || 0) + 1
        );

        metrics.brightnessSum += (r + g + b) / 3;

        if (i > 0) {
          const diff =
            Math.abs(r - data[i - 4]) +
            Math.abs(g - data[i - 3]) +
            Math.abs(b - data[i - 2]);
          if (diff > 30) metrics.edges++;
          metrics.variance += diff;
        }

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max > 0) {
          metrics.saturationSum += ((max - min) / max) * 100;
        }
      }

      const totalPixels = data.length / 4;
      const uniqueColors = metrics.colorFrequency.size;
      const complexity = (metrics.edges / totalPixels) * 100;
      const avgBrightness = metrics.brightnessSum / totalPixels;
      const avgSaturation = metrics.saturationSum / totalPixels;

      let imageType = "photo";
      if (uniqueColors < 256) {
        imageType = "graphic";
      } else if (complexity < 5) {
        imageType = "simple";
      } else if (complexity > 20) {
        imageType = "complex";
      }

      const hasTransparency = metrics.transparentPixels > 0;
      const transparencyRatio = (metrics.transparentPixels / totalPixels) * 100;

      return {
        complexity: parseFloat(complexity.toFixed(2)),
        uniqueColors,
        hasTransparency,
        transparencyRatio: parseFloat(transparencyRatio.toFixed(2)),
        imageType,
        avgBrightness: parseFloat(avgBrightness.toFixed(2)),
        avgSaturation: parseFloat(avgSaturation.toFixed(2)),
        variance: parseFloat((metrics.variance / totalPixels).toFixed(2)),
        recommendedQuality: this.calculateRecommendedQuality(
          complexity,
          imageType,
          hasTransparency
        ),
        compressibility: this.calculateCompressibility(
          uniqueColors,
          complexity
        ),
        suggestedFormat: this.suggestFormat(imageType, hasTransparency),
        edgeRatio: parseFloat(((metrics.edges / totalPixels) * 100).toFixed(2)),
        colorDiversity: parseFloat(
          ((uniqueColors / totalPixels) * 100).toFixed(2)
        ),
        isLowDetail: complexity < 5,
        isHighDetail: complexity > 20,
        isDark: avgBrightness < 85,
        isBright: avgBrightness > 170,
        isVibrant: avgSaturation > 40,
        isDesaturated: avgSaturation < 20,
      };
    }

    static calculateRecommendedQuality(complexity, imageType, hasTransparency) {
      if (imageType === "graphic" || imageType === "simple") return 0.65;
      if (hasTransparency && complexity < 10) return 0.7;
      if (complexity > 20) return 0.48;
      return 0.58;
    }

    static calculateCompressibility(uniqueColors, complexity) {
      let score = 50;
      if (uniqueColors < 256) score += 30;
      else if (uniqueColors < 1000) score += 20;
      else if (uniqueColors < 5000) score += 10;
      if (complexity < 5) score += 20;
      else if (complexity < 10) score += 10;
      return Math.min(100, score);
    }

    static suggestFormat(imageType, hasTransparency) {
      if (hasTransparency) return ImageFormat.PNG;
      if (imageType === "graphic") return ImageFormat.PNG;
      if (ImageUtils.isWebPSupported()) return ImageFormat.WEBP;
      return ImageFormat.JPEG;
    }
  }

  // ==================== ADVANCED IMAGE PROCESSING ====================

  class AdvancedProcessor {
    static applyChromaSubsampling(ctx, width, height, strength = 0.75) {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;

      for (let y = 0; y < height; y += 2) {
        for (let x = 0; x < width; x += 2) {
          let cbSum = 0,
            crSum = 0,
            count = 0;

          for (let dy = 0; dy < 2 && y + dy < height; dy++) {
            for (let dx = 0; dx < 2 && x + dx < width; dx++) {
              const i = ((y + dy) * width + (x + dx)) * 4;
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];

              const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
              const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

              cbSum += cb;
              crSum += cr;
              count++;
            }
          }

          const cbAvg = cbSum / count;
          const crAvg = crSum / count;

          for (let dy = 0; dy < 2 && y + dy < height; dy++) {
            for (let dx = 0; dx < 2 && x + dx < width; dx++) {
              const i = ((y + dy) * width + (x + dx)) * 4;
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];

              const yVal = 0.299 * r + 0.587 * g + 0.114 * b;

              const newR = yVal + 1.402 * (crAvg - 128);
              const newG =
                yVal - 0.344136 * (cbAvg - 128) - 0.714136 * (crAvg - 128);
              const newB = yVal + 1.772 * (cbAvg - 128);

              data[i] = r * (1 - strength) + newR * strength;
              data[i + 1] = g * (1 - strength) + newG * strength;
              data[i + 2] = b * (1 - strength) + newB * strength;
            }
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);
    }

    static applySelectiveBlur(ctx, width, height, edgeMap, blurRadius = 1.6) {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      const output = new Uint8ClampedArray(data);

      const kernel = this.createGaussianKernel(blurRadius);
      const kernelSize = kernel.length;
      const halfKernel = Math.floor(kernelSize / 2);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;

          if (edgeMap[y * width + x] > 0.22) continue;

          let r = 0,
            g = 0,
            b = 0,
            totalWeight = 0;

          for (let ky = 0; ky < kernelSize; ky++) {
            for (let kx = 0; kx < kernelSize; kx++) {
              const px = Math.min(width - 1, Math.max(0, x + kx - halfKernel));
              const py = Math.min(height - 1, Math.max(0, y + ky - halfKernel));
              const pi = (py * width + px) * 4;
              const weight = kernel[ky][kx];

              r += data[pi] * weight;
              g += data[pi + 1] * weight;
              b += data[pi + 2] * weight;
              totalWeight += weight;
            }
          }

          output[i] = r / totalWeight;
          output[i + 1] = g / totalWeight;
          output[i + 2] = b / totalWeight;
        }
      }

      imageData.data.set(output);
      ctx.putImageData(imageData, 0, 0);
    }

    static createGaussianKernel(sigma) {
      const size = Math.ceil(sigma * 3) * 2 + 1;
      const kernel = [];
      const center = Math.floor(size / 2);
      let sum = 0;

      for (let y = 0; y < size; y++) {
        kernel[y] = [];
        for (let x = 0; x < size; x++) {
          const dx = x - center;
          const dy = y - center;
          const value = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
          kernel[y][x] = value;
          sum += value;
        }
      }

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          kernel[y][x] /= sum;
        }
      }

      return kernel;
    }

    static detectEdges(ctx, width, height) {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      const edgeMap = new Float32Array(width * height);

      const sobelX = [
        [-1, 0, 1],
        [-2, 0, 2],
        [-1, 0, 1],
      ];
      const sobelY = [
        [-1, -2, -1],
        [0, 0, 0],
        [1, 2, 1],
      ];

      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          let gx = 0,
            gy = 0;

          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const i = ((y + ky) * width + (x + kx)) * 4;
              const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
              gx += gray * sobelX[ky + 1][kx + 1];
              gy += gray * sobelY[ky + 1][kx + 1];
            }
          }

          const magnitude = Math.sqrt(gx * gx + gy * gy) / 255;
          edgeMap[y * width + x] = Math.min(1, magnitude);
        }
      }

      return edgeMap;
    }

    static applyAdaptiveSharpening(
      ctx,
      width,
      height,
      edgeMap,
      strength = 0.85
    ) {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      const output = new Uint8ClampedArray(data);

      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const i = (y * width + x) * 4;
          const edgeStrength = edgeMap[y * width + x];

          if (edgeStrength < 0.12) continue;

          const localStrength = strength * edgeStrength;

          for (let c = 0; c < 3; c++) {
            const current = data[i + c];
            const neighbors =
              (data[i - 4 + c] +
                data[i + 4 + c] +
                data[i - width * 4 + c] +
                data[i + width * 4 + c]) /
              4;

            output[i + c] = Math.min(
              255,
              Math.max(0, current + (current - neighbors) * localStrength)
            );
          }
        }
      }

      imageData.data.set(output);
      ctx.putImageData(imageData, 0, 0);
    }

    static applyColorQuantization(ctx, width, height, levels = 220) {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      const step = 256 / levels;

      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.round(data[i] / step) * step;
        data[i + 1] = Math.round(data[i + 1] / step) * step;
        data[i + 2] = Math.round(data[i + 2] / step) * step;
      }

      ctx.putImageData(imageData, 0, 0);
    }
  }

  // ==================== COMPRESSION ENGINE ====================

  class CompressionEngine {
    static async compress(
      canvas,
      format,
      targetSize,
      analysis,
      qualityMode = CompressionQuality.AGGRESSIVE
    ) {
      const baseQuality = analysis.recommendedQuality;
      const qualityAdjustment = this.getQualityAdjustment(qualityMode);

      let minQuality = Math.max(0.02, baseQuality - qualityAdjustment.range);
      let maxQuality = Math.min(0.8, baseQuality + qualityAdjustment.boost);
      let bestBlob = null;
      let iterations = 0;
      const maxIterations = qualityAdjustment.iterations;

      while (iterations < maxIterations && maxQuality - minQuality > 0.002) {
        const quality = (minQuality + maxQuality) / 2;
        const blob = await ImageUtils.canvasToBlob(canvas, format, quality);

        if (blob.size <= targetSize * qualityAdjustment.tolerance) {
          bestBlob = blob;
          minQuality = quality;
        } else {
          maxQuality = quality;
        }

        iterations++;
      }

      if (!bestBlob) {
        bestBlob = await ImageUtils.canvasToBlob(canvas, format, minQuality);
      }

      return bestBlob;
    }

    static getQualityAdjustment(mode) {
      const adjustments = {
        [CompressionQuality.MAXIMUM]: {
          range: 0.2,
          boost: 0.06,
          tolerance: 1.15,
          iterations: 10,
        },
        [CompressionQuality.HIGH]: {
          range: 0.3,
          boost: 0.02,
          tolerance: 1.1,
          iterations: 12,
        },
        [CompressionQuality.BALANCED]: {
          range: 0.4,
          boost: -0.03,
          tolerance: 1.03,
          iterations: 14,
        },
        [CompressionQuality.AGGRESSIVE]: {
          range: 0.5,
          boost: -0.1,
          tolerance: 0.96,
          iterations: 18,
        },
        [CompressionQuality.EXTREME]: {
          range: 0.6,
          boost: -0.15,
          tolerance: 0.88,
          iterations: 24,
        },
      };
      return adjustments[mode] || adjustments[CompressionQuality.AGGRESSIVE];
    }

    static async advancedOptimize(canvas, format, targetSize, analysis) {
      const scales = [
        0.94, 0.9, 0.86, 0.82, 0.78, 0.74, 0.7, 0.66, 0.62, 0.58, 0.54, 0.5,
        0.46, 0.42, 0.38, 0.35,
      ];

      for (const scale of scales) {
        const tempCanvas = this.scaleCanvas(canvas, scale);
        const blob = await this.compress(
          tempCanvas,
          format,
          targetSize,
          analysis,
          CompressionQuality.EXTREME
        );

        if (blob.size <= targetSize) {
          return blob;
        }
      }

      const finalCanvas = this.scaleCanvas(canvas, 0.32);
      return await ImageUtils.canvasToBlob(finalCanvas, format, 0.02);
    }

    static scaleCanvas(sourceCanvas, scale) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(sourceCanvas.width * scale);
      canvas.height = Math.round(sourceCanvas.height * scale);

      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);

      return canvas;
    }

    static createOptimizedCanvas(img, dimensions, analysis) {
      const canvas = document.createElement("canvas");
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;

      const ctx = canvas.getContext("2d", {
        alpha: analysis.hasTransparency,
        desynchronized: true,
        willReadFrequently: false,
      });

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      this.drawWithSmartCrop(ctx, img, dimensions);

      const edgeMap = AdvancedProcessor.detectEdges(
        ctx,
        canvas.width,
        canvas.height
      );

      AdvancedProcessor.applyChromaSubsampling(
        ctx,
        canvas.width,
        canvas.height,
        0.78
      );
      AdvancedProcessor.applySelectiveBlur(
        ctx,
        canvas.width,
        canvas.height,
        edgeMap,
        1.4
      );
      AdvancedProcessor.applyColorQuantization(
        ctx,
        canvas.width,
        canvas.height,
        218
      );

      if (analysis.imageType === "photo" && dimensions.scale < 0.88) {
        AdvancedProcessor.applyAdaptiveSharpening(
          ctx,
          canvas.width,
          canvas.height,
          edgeMap,
          0.75
        );
      }

      return canvas;
    }

    static drawWithSmartCrop(ctx, img, dims) {
      const { width, height, sourceWidth, sourceHeight } = dims;
      const sourceAspect = sourceWidth / sourceHeight;
      const targetAspect = width / height;

      let sx = 0,
        sy = 0,
        sw = sourceWidth,
        sh = sourceHeight;

      if (sourceAspect > targetAspect) {
        sw = sourceHeight * targetAspect;
        sx = (sourceWidth - sw) / 2;
      } else if (sourceAspect < targetAspect) {
        sh = sourceWidth / targetAspect;
        sy = (sourceHeight - sh) / 2;
      }

      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
    }
  }

  // ==================== EVENT EMITTER ====================

  class EventEmitter {
    constructor() {
      this.events = new Map();
    }

    on(event, callback) {
      if (!this.events.has(event)) {
        this.events.set(event, []);
      }
      this.events.get(event).push(callback);
      return () => this.off(event, callback);
    }

    off(event, callback) {
      const callbacks = this.events.get(event);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) callbacks.splice(index, 1);
      }
    }

    emit(event, data) {
      const callbacks = this.events.get(event);
      if (callbacks) {
        callbacks.forEach((cb) => {
          try {
            cb(data);
          } catch (err) {
            console.error(`Error in event handler for ${event}:`, err);
          }
        });
      }
    }

    once(event, callback) {
      const wrapper = (data) => {
        callback(data);
        this.off(event, wrapper);
      };
      this.on(event, wrapper);
    }

    removeAllListeners(event) {
      if (event) {
        this.events.delete(event);
      } else {
        this.events.clear();
      }
    }
  }

  // ==================== MAIN CLASS ====================

  class UltraCompressPro extends EventEmitter {
    constructor(config = {}) {
      super();

      this.config = {
        defaultQuality: CompressionQuality.AGGRESSIVE,
        maxFileSize: 50 * 1024 * 1024,
        concurrency: 5,
        enableWebWorkers: false,
        cacheResults: false,
        ...config,
      };

      this.presets = {
        thumbnail: { maxDimension: 150, targetSize: 8 * 1024, aspectRatio: 1 },
        small: { maxDimension: 420, targetSize: 9 * 1024, aspectRatio: 4 / 3 },
        medium: {
          maxDimension: 600,
          targetSize: 18 * 1024,
          aspectRatio: 4 / 3,
        },
        large: { maxDimension: 864, targetSize: 24 * 1024, aspectRatio: 4 / 3 },
        xlarge: {
          maxDimension: 1024,
          targetSize: 45 * 1024,
          aspectRatio: 4 / 3,
        },
        hd: { maxDimension: 1280, targetSize: 65 * 1024, aspectRatio: 16 / 9 },
        fullhd: {
          maxDimension: 1920,
          targetSize: 110 * 1024,
          aspectRatio: 16 / 9,
        },
      };

      this.stats = {
        totalProcessed: 0,
        totalOriginalSize: 0,
        totalCompressedSize: 0,
        averageCompressionRatio: 0,
        averageProcessingTime: 0,
        sessionStartTime: Date.now(),
      };

      this.version = VERSION;
      this._abortController = null;
    }

    getInfo() {
      return {
        name: "UltraCompressPro",
        version: VERSION,
        features: [
          "Multi-version output",
          "AI-powered analysis",
          "Real-time progress",
          "Animated GIF support",
          "Framework agnostic",
          "Memory efficient",
          "TypeScript ready",
          "Ultra aggressive compression",
        ],
        formats: Object.values(ImageFormat),
        qualityModes: Object.values(CompressionQuality),
        presets: Object.keys(this.presets),
        stats: this.getStats(),
      };
    }

    getStats() {
      const avgRatio =
        this.stats.totalOriginalSize > 0
          ? ((this.stats.totalOriginalSize - this.stats.totalCompressedSize) /
              this.stats.totalOriginalSize) *
            100
          : 0;

      return {
        totalProcessed: this.stats.totalProcessed,
        totalOriginalSize: this.stats.totalOriginalSize,
        totalCompressedSize: this.stats.totalCompressedSize,
        totalSaved:
          this.stats.totalOriginalSize - this.stats.totalCompressedSize,
        averageCompressionRatio: parseFloat(avgRatio.toFixed(2)),
        averageProcessingTime: parseFloat(
          this.stats.averageProcessingTime.toFixed(2)
        ),
        sessionDuration: Date.now() - this.stats.sessionStartTime,
        averageSavingsPerImage:
          this.stats.totalProcessed > 0
            ? (this.stats.totalOriginalSize - this.stats.totalCompressedSize) /
              this.stats.totalProcessed
            : 0,
      };
    }

    resetStats() {
      this.stats = {
        totalProcessed: 0,
        totalOriginalSize: 0,
        totalCompressedSize: 0,
        averageCompressionRatio: 0,
        averageProcessingTime: 0,
        sessionStartTime: Date.now(),
      };
    }

    validateFile(file) {
      if (!file || !(file instanceof Blob)) {
        throw new Error("Invalid input: must be a File or Blob");
      }

      if (file.size === 0) {
        throw new Error("Invalid input: file is empty");
      }

      if (file.size > this.config.maxFileSize) {
        throw new Error(
          `File too large: maximum ${this.config.maxFileSize / 1024 / 1024}MB`
        );
      }

      return true;
    }

    async compress(file, options = {}) {
      const startTime = performance.now();
      const jobId = `job_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const opts = {
        quality: this.config.defaultQuality,
        presets: ["large", "small"],
        customPresets: null,
        outputFormat: null,
        metadata: true,
        ...options,
      };

      try {
        this.validateFile(file);
        this.emit(EventType.START, {
          jobId,
          fileName: file.name,
          fileSize: file.size,
        });

        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const detectedType = ImageUtils.detectMimeType(bytes);
        const isAnimated = await ImageUtils.isAnimated(file);

        const img = await ImageUtils.loadImage(file);
        const analysis = await ImageAnalyzer.analyze(img, file);

        const presetsToUse =
          opts.customPresets || opts.presets.map((p) => this.presets[p] || p);

        const versions = await this._processVersions(
          img,
          file,
          presetsToUse,
          analysis,
          opts,
          jobId
        );

        const totalTime = performance.now() - startTime;

        this._updateStats(file, versions, totalTime);

        const result = {
          success: true,
          jobId,
          file: {
            name: file.name,
            size: file.size,
            sizeKB: parseFloat((file.size / 1024).toFixed(2)),
            sizeMB: parseFloat((file.size / 1024 / 1024).toFixed(2)),
            type: file.type || detectedType,
            dimensions: `${img.width}x${img.height}`,
            width: img.width,
            height: img.height,
            aspectRatio: parseFloat((img.width / img.height).toFixed(3)),
            isAnimated,
          },
          versions,
          analysis,
          performance: {
            totalTime: parseFloat(totalTime.toFixed(2)),
            timePerVersion: parseFloat(
              (totalTime / versions.length).toFixed(2)
            ),
            throughput: parseFloat(
              (file.size / 1024 / (totalTime / 1000)).toFixed(2)
            ),
          },
          summary: this._generateSummary(file, versions),
          timestamp: new Date().toISOString(),
        };

        this.emit(EventType.COMPLETE, result);
        return result;
      } catch (error) {
        const errorResult = {
          success: false,
          jobId,
          error: error.message,
          stack: error.stack,
          file: { name: file.name, size: file.size },
        };
        this.emit(EventType.ERROR, errorResult);
        throw error;
      }
    }

    async compressMultiple(files, options = {}) {
      const batchId = `batch_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const filesArray = Array.from(files);
      const startTime = performance.now();

      const opts = {
        concurrency: this.config.concurrency,
        onProgress: null,
        onFileComplete: null,
        stopOnError: false,
        ...options,
      };

      this._abortController = new AbortController();
      const results = [];
      let processed = 0;
      let failed = 0;

      this.emit(EventType.BATCH_START, {
        batchId,
        totalFiles: filesArray.length,
        options: opts,
      });

      try {
        for (let i = 0; i < filesArray.length; i += opts.concurrency) {
          if (this._abortController.signal.aborted) {
            throw new Error("Batch processing cancelled");
          }

          const batch = filesArray.slice(i, i + opts.concurrency);
          const batchResults = await Promise.allSettled(
            batch.map((file) => this.compress(file, options))
          );

          batchResults.forEach((result, idx) => {
            const file = batch[idx];
            processed++;

            const resultData = {
              fileName: file.name,
              fileSize: file.size,
              index: i + idx,
              success: result.status === "fulfilled",
              data: result.status === "fulfilled" ? result.value : null,
              error:
                result.status === "rejected" ? result.reason.message : null,
            };

            if (!resultData.success) failed++;

            results.push(resultData);

            const progressData = {
              batchId,
              processed,
              total: filesArray.length,
              percentage: parseFloat(
                ((processed / filesArray.length) * 100).toFixed(2)
              ),
              currentFile: file.name,
              currentIndex: i + idx,
              success: resultData.success,
              failed,
              remaining: filesArray.length - processed,
            };

            this.emit(EventType.PROGRESS, progressData);
            if (opts.onProgress) opts.onProgress(progressData);

            if (opts.onFileComplete) {
              opts.onFileComplete(resultData, progressData);
            }

            if (opts.stopOnError && !resultData.success) {
              throw new Error(
                `Processing stopped due to error: ${resultData.error}`
              );
            }
          });
        }

        const totalTime = performance.now() - startTime;
        const successful = results.filter((r) => r.success);

        const totalOriginalSize = results.reduce(
          (sum, r) => sum + (r.fileSize || 0),
          0
        );
        const totalCompressedSize = successful.reduce((sum, r) => {
          return (
            sum + (r.data?.versions?.reduce((s, v) => s + v.blob.size, 0) || 0)
          );
        }, 0);

        const batchResult = {
          success: true,
          batchId,
          results,
          summary: {
            total: filesArray.length,
            successful: successful.length,
            failed: failed,
            successRate: parseFloat(
              ((successful.length / filesArray.length) * 100).toFixed(2)
            ),

            totalOriginalSize,
            totalCompressedSize,
            totalSaved: totalOriginalSize - totalCompressedSize,

            totalOriginalSizeKB: parseFloat(
              (totalOriginalSize / 1024).toFixed(2)
            ),
            totalCompressedSizeKB: parseFloat(
              (totalCompressedSize / 1024).toFixed(2)
            ),
            totalSavedKB: parseFloat(
              ((totalOriginalSize - totalCompressedSize) / 1024).toFixed(2)
            ),

            totalOriginalSizeMB: parseFloat(
              (totalOriginalSize / 1024 / 1024).toFixed(2)
            ),
            totalCompressedSizeMB: parseFloat(
              (totalCompressedSize / 1024 / 1024).toFixed(2)
            ),
            totalSavedMB: parseFloat(
              ((totalOriginalSize - totalCompressedSize) / 1024 / 1024).toFixed(
                2
              )
            ),

            compressionRatio:
              totalOriginalSize > 0
                ? parseFloat(
                    (
                      ((totalOriginalSize - totalCompressedSize) /
                        totalOriginalSize) *
                      100
                    ).toFixed(2)
                  )
                : 0,

            averageOriginalSize: parseFloat(
              (totalOriginalSize / filesArray.length / 1024).toFixed(2)
            ),
            averageCompressedSize:
              successful.length > 0
                ? parseFloat(
                    (totalCompressedSize / successful.length / 1024).toFixed(2)
                  )
                : 0,

            totalTime: parseFloat(totalTime.toFixed(2)),
            averageTimePerFile: parseFloat(
              (totalTime / filesArray.length).toFixed(2)
            ),
            throughput: parseFloat(
              (totalOriginalSize / 1024 / (totalTime / 1000)).toFixed(2)
            ),
          },
          timestamp: new Date().toISOString(),
        };

        this.emit(EventType.BATCH_COMPLETE, batchResult);
        return batchResult;
      } catch (error) {
        const errorResult = {
          success: false,
          batchId,
          error: error.message,
          processed,
          failed,
          results,
        };
        this.emit(EventType.ERROR, errorResult);
        throw error;
      } finally {
        this._abortController = null;
      }
    }

    cancel() {
      if (this._abortController) {
        this._abortController.abort();
        this.emit(EventType.CANCEL, {
          cancelled: true,
          timestamp: new Date().toISOString(),
        });
      }
    }

    addPreset(name, config) {
      const { maxDimension, targetSize, aspectRatio = null } = config;

      if (!maxDimension || !targetSize) {
        throw new Error("Preset requires maxDimension and targetSize");
      }

      this.presets[name] = {
        maxDimension: parseInt(maxDimension),
        targetSize: parseInt(targetSize),
        aspectRatio: aspectRatio ? parseFloat(aspectRatio) : null,
      };

      return this.presets[name];
    }

    removePreset(name) {
      if (this.presets[name]) {
        delete this.presets[name];
        return true;
      }
      return false;
    }

    getPresets() {
      return { ...this.presets };
    }

    async loadImage(file) {
      return ImageUtils.loadImage(file);
    }

    createCanvas(img, dimensions) {
      const canvas = document.createElement("canvas");
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, dimensions.width, dimensions.height);
      return canvas;
    }

    async canvasToBlob(canvas, format = ImageFormat.JPEG, quality = 0.9) {
      return ImageUtils.canvasToBlob(canvas, format, quality);
    }

    calculateDimensions(width, height, maxDimension, aspectRatio = null) {
      return ImageUtils.calculateDimensions(
        width,
        height,
        maxDimension,
        aspectRatio
      );
    }

    async analyzeImage(file) {
      this.validateFile(file);
      const img = await ImageUtils.loadImage(file);
      return ImageAnalyzer.analyze(img, file);
    }

    isFormatSupported(format) {
      if (format === ImageFormat.WEBP) {
        return ImageUtils.isWebPSupported();
      }
      return Object.values(ImageFormat).includes(format);
    }

    async _processVersions(img, file, presets, analysis, opts, jobId) {
      const versions = [];

      for (let i = 0; i < presets.length; i++) {
        const preset = presets[i];
        const versionStartTime = performance.now();

        try {
          const dimensions = ImageUtils.calculateDimensions(
            img.width,
            img.height,
            preset.maxDimension,
            preset.aspectRatio
          );

          const canvas = CompressionEngine.createOptimizedCanvas(
            img,
            dimensions,
            analysis
          );

          const outputFormat = opts.outputFormat || analysis.suggestedFormat;

          let blob = await CompressionEngine.compress(
            canvas,
            outputFormat,
            preset.targetSize,
            analysis,
            opts.quality
          );

          if (blob.size > preset.targetSize * 1.12) {
            blob = await CompressionEngine.advancedOptimize(
              canvas,
              outputFormat,
              preset.targetSize,
              analysis
            );
          }

          const versionTime = performance.now() - versionStartTime;

          const metadata = this._generateMetadata(
            file,
            blob,
            dimensions,
            outputFormat,
            versionTime,
            analysis,
            preset,
            i
          );

          const version = {
            blob,
            metadata,
            preview: URL.createObjectURL(blob),
            dataUrl: null,
          };

          versions.push(version);

          this.emit(EventType.VERSION_COMPLETE, {
            jobId,
            versionIndex: i,
            totalVersions: presets.length,
            metadata,
          });
        } catch (error) {
          console.error(`Failed to create version ${i}:`, error);
        }
      }

      return versions;
    }

    _generateMetadata(
      file,
      blob,
      dimensions,
      format,
      time,
      analysis,
      preset,
      index
    ) {
      const originalSize = file.size;
      const compressedSize = blob.size;
      const saved = originalSize - compressedSize;
      const ratio = (saved / originalSize) * 100;

      return {
        versionIndex: index,
        presetName: typeof preset === "string" ? preset : "custom",

        originalSize,
        compressedSize,
        saved,
        originalSizeKB: parseFloat((originalSize / 1024).toFixed(2)),
        compressedSizeKB: parseFloat((compressedSize / 1024).toFixed(2)),
        savedKB: parseFloat((saved / 1024).toFixed(2)),
        originalSizeMB: parseFloat((originalSize / 1024 / 1024).toFixed(4)),
        compressedSizeMB: parseFloat((compressedSize / 1024 / 1024).toFixed(4)),
        savedMB: parseFloat((saved / 1024 / 1024).toFixed(4)),

        compressionRatio: parseFloat(ratio.toFixed(2)),
        compressionRatioFormatted: `${ratio.toFixed(2)}%`,
        sizeReduction: parseFloat((compressedSize / originalSize).toFixed(4)),
        efficiency: ratio > 0 ? "good" : ratio > 50 ? "excellent" : "moderate",

        width: dimensions.width,
        height: dimensions.height,
        dimensions: `${dimensions.width}x${dimensions.height}`,
        aspectRatio: parseFloat(dimensions.aspectRatio.toFixed(3)),
        scale: parseFloat(dimensions.scale.toFixed(4)),
        resolutionReduction: parseFloat((1 - dimensions.scale).toFixed(4)),

        inputFormat: file.type,
        outputFormat: format,
        formatChanged: file.type !== format,

        compressionTime: parseFloat(time.toFixed(2)),
        compressionTimeFormatted: `${time.toFixed(2)}ms`,
        throughput: parseFloat(
          (originalSize / 1024 / (time / 1000)).toFixed(2)
        ),
        throughputFormatted: `${(originalSize / 1024 / (time / 1000)).toFixed(
          2
        )} KB/s`,

        quality: analysis.recommendedQuality
          ? `${(analysis.recommendedQuality * 100).toFixed(0)}%`
          : "auto",
        qualityScore: parseFloat(
          (analysis.recommendedQuality * 100).toFixed(0)
        ),

        imageType: analysis.imageType,
        complexity: analysis.complexity,
        compressibility: analysis.compressibility,
        hasTransparency: analysis.hasTransparency,

        processedAt: new Date().toISOString(),
        timestamp: Date.now(),
      };
    }

    _generateSummary(file, versions) {
      const totalCompressedSize = versions.reduce(
        (sum, v) => sum + v.blob.size,
        0
      );
      const avgCompressedSize = totalCompressedSize / versions.length;
      const avgRatio =
        versions.reduce((sum, v) => {
          return sum + parseFloat(v.metadata.compressionRatio);
        }, 0) / versions.length;

      return {
        versionsCount: versions.length,
        bestVersion: versions.reduce(
          (best, v, i) =>
            v.blob.size < best.size
              ? {
                  index: i,
                  size: v.blob.size,
                  ratio: v.metadata.compressionRatio,
                }
              : best,
          {
            index: 0,
            size: versions[0].blob.size,
            ratio: versions[0].metadata.compressionRatio,
          }
        ),
        totalOutputSize: totalCompressedSize,
        totalOutputSizeKB: parseFloat((totalCompressedSize / 1024).toFixed(2)),
        averageOutputSize: avgCompressedSize,
        averageOutputSizeKB: parseFloat((avgCompressedSize / 1024).toFixed(2)),
        averageCompressionRatio: parseFloat(avgRatio.toFixed(2)),
        totalSavings: file.size * versions.length - totalCompressedSize,
        recommendation: this._getRecommendation(versions),
      };
    }

    _getRecommendation(versions) {
      if (versions.length < 2) return null;

      const quality = versions[0];
      const size = versions[versions.length - 1];

      return {
        forQuality: {
          index: 0,
          size: quality.metadata.compressedSizeKB,
          dimensions: quality.metadata.dimensions,
          reason: "Best quality with acceptable compression",
        },
        forSize: {
          index: versions.length - 1,
          size: size.metadata.compressedSizeKB,
          dimensions: size.metadata.dimensions,
          reason: "Smallest file size",
        },
        balanced:
          versions.length > 1
            ? {
                index: Math.floor(versions.length / 2),
                size: versions[Math.floor(versions.length / 2)].metadata
                  .compressedSizeKB,
                dimensions:
                  versions[Math.floor(versions.length / 2)].metadata.dimensions,
                reason: "Best balance between quality and size",
              }
            : null,
      };
    }

    _updateStats(file, versions, time) {
      this.stats.totalProcessed++;
      this.stats.totalOriginalSize += file.size;
      this.stats.totalCompressedSize += versions.reduce(
        (sum, v) => sum + v.blob.size,
        0
      );

      const totalTime =
        this.stats.averageProcessingTime * (this.stats.totalProcessed - 1) +
        time;
      this.stats.averageProcessingTime = totalTime / this.stats.totalProcessed;
    }
  }

  // ==================== EXPORTS ====================

  UltraCompressPro.VERSION = VERSION;
  UltraCompressPro.CompressionQuality = CompressionQuality;
  UltraCompressPro.ImageFormat = ImageFormat;
  UltraCompressPro.ProcessingStatus = ProcessingStatus;
  UltraCompressPro.EventType = EventType;

  UltraCompressPro.Utils = ImageUtils;
  UltraCompressPro.Analyzer = ImageAnalyzer;
  UltraCompressPro.Engine = CompressionEngine;

  if (typeof console !== "undefined") {
    console.log(
      `%c🚀 UltraCompressPro v${VERSION} loaded - Ultra Aggressive Mode`,
      "color: #10b981; font-size: 14px; font-weight: bold;"
    );
  }

  return UltraCompressPro;
});

// ======================================================================
// ==================== CUSTOM APP COMPRESSOR WRAPPER ===================
// ======================================================================
// Custom wrapper for app-specific usage with progress reporting

class AppImageCompressor {
  constructor() {
    this.compressor = new UltraCompressPro({
      defaultQuality: "aggressive",
    });

    this.presetSmall = {
      maxDimension: 420,
      targetSize: 9 * 1024,
      aspectRatio: 4 / 3,
    };

    this.presetLarge = {
      maxDimension: 864,
      targetSize: 24 * 1024,
      aspectRatio: 4 / 3,
    };
  }

  /**
   * Process single image with 4:3 aspect ratio validation and dual output
   * @param {File} file - Input image file
   * @param {Function} [onProgress] - Optional progress callback (percent, message)
   * @returns {Promise<Object>} - Result with large and small versions
   */
  async processImage(file, onProgress) {
    const reportProgress = (percent, message) => {
      if (onProgress && typeof onProgress === "function") {
        onProgress({ percent, message });
      }
    };

    try {
      reportProgress(5, "Đang xác thực tệp...");
      this.compressor.validateFile(file);

      reportProgress(15, "Đang kiểm tra tỷ lệ khung hình...");
      const img = await UltraCompressPro.Utils.loadImage(file);
      const aspectRatio = img.width / img.height;
      const targetAspectRatio = 4 / 3;

      if (Math.abs(aspectRatio - targetAspectRatio) > 0.01) {
        throw new Error(
          `Ảnh phải có tỷ lệ 4:3. Tỷ lệ hiện tại: ${aspectRatio.toFixed(2)}:1`
        );
      }

      const progressListener = (versionData) => {
        const baseProgress = 20;
        const compressionWorkload = 70;
        const progress =
          baseProgress +
          (compressionWorkload / 2) * (versionData.versionIndex + 1);
        reportProgress(
          Math.round(progress),
          `Nén phiên bản ${versionData.versionIndex + 1}/2...`
        );
      };

      this.compressor.on("version_complete", progressListener);

      reportProgress(20, "Bắt đầu nén siêu mạnh...");
      const result = await this.compressor.compress(file, {
        customPresets: [this.presetLarge, this.presetSmall],
      });

      this.compressor.off("version_complete", progressListener);

      if (!result.success || result.versions.length < 2) {
        throw new Error("Không thể tạo đủ 2 phiên bản ảnh.");
      }

      reportProgress(95, "Đang hoàn tất...");

      const largeVersion = result.versions.find(
        (v) => v.metadata.width === 864 || v.metadata.height === 864
      );
      const smallVersion = result.versions.find(
        (v) => v.metadata.width === 420 || v.metadata.height === 420
      );

      if (!largeVersion || !smallVersion) {
        throw new Error("Kết quả nén không chứa đủ các phiên bản yêu cầu.");
      }

      return {
        success: true,
        original: {
          name: file.name,
          size: file.size,
          width: img.width,
          height: img.height,
        },
        large: {
          blob: largeVersion.blob,
          url: largeVersion.preview,
          metadata: largeVersion.metadata,
        },
        small: {
          blob: smallVersion.blob,
          url: smallVersion.preview,
          metadata: smallVersion.metadata,
        },
      };
    } catch (error) {
      console.error("AppImageCompressor Error:", error);
      reportProgress(100, `Lỗi: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}
