/**
 * UltraCompressPro v3.0.0 - Professional Image Compression Library
 *
 * @description Zero-dependency, browser-native image compression with AI-powered optimization
 * @author UltraCompressPro Team
 * @license MIT
 * @version 3.0.0
 *
 * ======================================================================
 * CUSTOMIZATION NOTE:
 * This file includes the original UltraCompressPro library and a custom
 * wrapper class `AppImageCompressor` at the end for specific app usage.
 * ======================================================================
 */

(function (global, factory) {
  // UMD pattern for universal module support
  if (typeof exports === "object" && typeof module !== "undefined") {
    // CommonJS (Node.js)
    module.exports = factory();
  } else if (typeof define === "function" && define.amd) {
    // AMD
    define([], factory);
  } else {
    // Browser globals
    global.UltraCompressPro = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ==================== CONSTANTS & ENUMS ====================

  const VERSION = "3.0.0";

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
    /**
     * Detect file type from magic bytes
     * @param {Uint8Array} bytes - File bytes
     * @returns {string} MIME type
     */
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

    /**
     * Check if image has animation
     * @param {File} file - Image file
     * @returns {Promise<boolean>}
     */
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

    /**
     * Load image from file/blob
     * @param {File|Blob} file - Image file
     * @returns {Promise<HTMLImageElement>}
     */
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

    /**
     * Convert canvas to blob with fallback
     * @param {HTMLCanvasElement} canvas
     * @param {string} mimeType
     * @param {number} quality
     * @returns {Promise<Blob>}
     */
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

    /**
     * Check WebP support
     * @returns {boolean}
     */
    static isWebPSupported() {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      return canvas.toDataURL("image/webp").indexOf("data:image/webp") === 0;
    }

    /**
     * Calculate optimal dimensions with aspect ratio
     * @param {number} width - Original width
     * @param {number} height - Original height
     * @param {number} maxDimension - Maximum dimension
     * @param {number} targetAspectRatio - Target aspect ratio
     * @returns {Object}
     */
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
    /**
     * Analyze image characteristics for optimal compression
     * @param {HTMLImageElement} img - Source image
     * @param {File} file - Original file
     * @returns {Promise<Object>}
     */
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

        // Transparency
        if (a < 255) metrics.transparentPixels++;

        // Color frequency
        const colorKey = `${r},${g},${b}`;
        metrics.colorFrequency.set(
          colorKey,
          (metrics.colorFrequency.get(colorKey) || 0) + 1
        );

        // Brightness
        metrics.brightnessSum += (r + g + b) / 3;

        // Edge detection
        if (i > 0) {
          const diff =
            Math.abs(r - data[i - 4]) +
            Math.abs(g - data[i - 3]) +
            Math.abs(b - data[i - 2]);
          if (diff > 30) metrics.edges++;
          metrics.variance += diff;
        }

        // Saturation (simplified)
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

      // Determine image type
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
        // Basic metrics
        complexity: parseFloat(complexity.toFixed(2)),
        uniqueColors,
        hasTransparency,
        transparencyRatio: parseFloat(transparencyRatio.toFixed(2)),

        // Image characteristics
        imageType,
        avgBrightness: parseFloat(avgBrightness.toFixed(2)),
        avgSaturation: parseFloat(avgSaturation.toFixed(2)),
        variance: parseFloat((metrics.variance / totalPixels).toFixed(2)),

        // Compression recommendations
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

        // Advanced metrics
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
      if (imageType === "graphic" || imageType === "simple") return 0.85;
      if (hasTransparency && complexity < 10) return 0.88;
      if (complexity > 20) return 0.75;
      return 0.8;
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

  // ==================== COMPRESSION ENGINE ====================

  class CompressionEngine {
    /**
     * Intelligent binary search compression
     * @param {HTMLCanvasElement} canvas
     * @param {string} format
     * @param {number} targetSize
     * @param {Object} analysis
     * @param {string} qualityMode
     * @returns {Promise<Blob>}
     */
    static async compress(
      canvas,
      format,
      targetSize,
      analysis,
      qualityMode = CompressionQuality.BALANCED
    ) {
      const baseQuality = analysis.recommendedQuality;
      const qualityAdjustment = this.getQualityAdjustment(qualityMode);

      let minQuality = Math.max(0.1, baseQuality - qualityAdjustment.range);
      let maxQuality = Math.min(0.98, baseQuality + qualityAdjustment.boost);
      let bestBlob = null;
      let iterations = 0;
      const maxIterations = qualityAdjustment.iterations;

      while (iterations < maxIterations && maxQuality - minQuality > 0.005) {
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
          range: 0.1,
          boost: 0.15,
          tolerance: 1.3,
          iterations: 12,
        },
        [CompressionQuality.HIGH]: {
          range: 0.15,
          boost: 0.1,
          tolerance: 1.2,
          iterations: 15,
        },
        [CompressionQuality.BALANCED]: {
          range: 0.25,
          boost: 0.05,
          tolerance: 1.1,
          iterations: 15,
        },
        [CompressionQuality.AGGRESSIVE]: {
          range: 0.35,
          boost: 0,
          tolerance: 1.0,
          iterations: 18,
        },
        [CompressionQuality.EXTREME]: {
          range: 0.45,
          boost: 0,
          tolerance: 0.95,
          iterations: 20,
        },
      };
      return adjustments[mode] || adjustments[CompressionQuality.BALANCED];
    }

    /**
     * Advanced optimization with progressive scaling
     * @param {HTMLCanvasElement} canvas
     * @param {string} format
     * @param {number} targetSize
     * @param {Object} analysis
     * @returns {Promise<Blob>}
     */
    static async advancedOptimize(canvas, format, targetSize, analysis) {
      const scales = [
        0.98, 0.95, 0.92, 0.88, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5,
      ];

      for (const scale of scales) {
        const tempCanvas = this.scaleCanvas(canvas, scale);
        const blob = await this.compress(
          tempCanvas,
          format,
          targetSize,
          analysis,
          CompressionQuality.AGGRESSIVE
        );

        if (blob.size <= targetSize) {
          return blob;
        }
      }

      // Last resort
      const finalCanvas = this.scaleCanvas(canvas, 0.4);
      return await ImageUtils.canvasToBlob(finalCanvas, format, 0.1);
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

    /**
     * Create optimized canvas with smart cropping
     * @param {HTMLImageElement} img
     * @param {Object} dimensions
     * @param {Object} analysis
     * @returns {HTMLCanvasElement}
     */
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
      ctx.imageSmoothingQuality =
        analysis.imageType === "graphic" ? "high" : "high";

      this.drawWithSmartCrop(ctx, img, dimensions);

      // Apply sharpening for downscaled photos
      if (analysis.imageType === "photo" && dimensions.scale < 0.7) {
        this.applySharpen(ctx, canvas.width, canvas.height, 0.3);
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

    static applySharpen(ctx, width, height, strength = 0.3) {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      const output = new Uint8ClampedArray(data);

      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const i = (y * width + x) * 4;

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
              Math.max(0, current + (current - neighbors) * strength)
            );
          }
        }
      }

      imageData.data.set(output);
      ctx.putImageData(imageData, 0, 0);
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
        defaultQuality: CompressionQuality.BALANCED,
        maxFileSize: 50 * 1024 * 1024, // 50MB
        concurrency: 5,
        enableWebWorkers: false, // Future feature
        cacheResults: false,
        ...config,
      };

      this.presets = {
        thumbnail: { maxDimension: 150, targetSize: 10 * 1024, aspectRatio: 1 },
        small: { maxDimension: 420, targetSize: 16 * 1024, aspectRatio: 4 / 3 },
        medium: {
          maxDimension: 600,
          targetSize: 30 * 1024,
          aspectRatio: 4 / 3,
        },
        large: { maxDimension: 864, targetSize: 45 * 1024, aspectRatio: 4 / 3 },
        xlarge: {
          maxDimension: 1024,
          targetSize: 80 * 1024,
          aspectRatio: 4 / 3,
        },
        hd: { maxDimension: 1280, targetSize: 120 * 1024, aspectRatio: 16 / 9 },
        fullhd: {
          maxDimension: 1920,
          targetSize: 200 * 1024,
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

    // ==================== PUBLIC API ====================

    /**
     * Get library information
     * @returns {Object}
     */
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
        ],
        formats: Object.values(ImageFormat),
        qualityModes: Object.values(CompressionQuality),
        presets: Object.keys(this.presets),
        stats: this.getStats(),
      };
    }

    /**
     * Get processing statistics
     * @returns {Object}
     */
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

    /**
     * Reset statistics
     */
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

    /**
     * Validate input file
     * @param {File|Blob} file
     * @throws {Error}
     */
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

    /**
     * Compress single image with multiple versions
     * @param {File|Blob} file - Input image
     * @param {Object} options - Compression options
     * @returns {Promise<CompressionResult>}
     */
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

        // Analyze file
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const detectedType = ImageUtils.detectMimeType(bytes);
        const isAnimated = await ImageUtils.isAnimated(file);

        // Load and analyze image
        const img = await ImageUtils.loadImage(file);
        const analysis = await ImageAnalyzer.analyze(img, file);

        // Determine presets
        const presetsToUse =
          opts.customPresets || opts.presets.map((p) => this.presets[p] || p);

        // Process versions
        const versions = await this._processVersions(
          img,
          file,
          presetsToUse,
          analysis,
          opts,
          jobId
        );

        const totalTime = performance.now() - startTime;

        // Update stats
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

    /**
     * Compress multiple images with batch processing
     * @param {File[]|FileList} files - Input images
     * @param {Object} options - Batch options
     * @returns {Promise<BatchResult>}
     */
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
        // Process in batches
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

            // Progress callback
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

            // File complete callback
            if (opts.onFileComplete) {
              opts.onFileComplete(resultData, progressData);
            }

            // Stop on error
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
              (totalOriginalSize - totalCompressedSize) / 1024
            ).toFixed(2),

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

    /**
     * Cancel ongoing batch operation
     */
    cancel() {
      if (this._abortController) {
        this._abortController.abort();
        this.emit(EventType.CANCEL, {
          cancelled: true,
          timestamp: new Date().toISOString(),
        });
      }
    }

    /**
     * Create custom preset
     * @param {string} name - Preset name
     * @param {Object} config - Preset configuration
     */
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

    /**
     * Remove custom preset
     * @param {string} name - Preset name
     */
    removePreset(name) {
      if (this.presets[name]) {
        delete this.presets[name];
        return true;
      }
      return false;
    }

    /**
     * Get available presets
     * @returns {Object}
     */
    getPresets() {
      return { ...this.presets };
    }

    // ==================== UTILITY PUBLIC METHODS ====================

    /**
     * Load image from file (for crop/preview)
     * @param {File|Blob} file
     * @returns {Promise<HTMLImageElement>}
     */
    async loadImage(file) {
      return ImageUtils.loadImage(file);
    }

    /**
     * Create canvas from image
     * @param {HTMLImageElement} img
     * @param {Object} dimensions
     * @returns {HTMLCanvasElement}
     */
    createCanvas(img, dimensions) {
      const canvas = document.createElement("canvas");
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, dimensions.width, dimensions.height);
      return canvas;
    }

    /**
     * Convert canvas to blob
     * @param {HTMLCanvasElement} canvas
     * @param {string} format
     * @param {number} quality
     * @returns {Promise<Blob>}
     */
    async canvasToBlob(canvas, format = ImageFormat.JPEG, quality = 0.9) {
      return ImageUtils.canvasToBlob(canvas, format, quality);
    }

    /**
     * Calculate dimensions for given constraints
     * @param {number} width
     * @param {number} height
     * @param {number} maxDimension
     * @param {number} aspectRatio
     * @returns {Object}
     */
    calculateDimensions(width, height, maxDimension, aspectRatio = null) {
      return ImageUtils.calculateDimensions(
        width,
        height,
        maxDimension,
        aspectRatio
      );
    }

    /**
     * Analyze image without compression
     * @param {File|Blob} file
     * @returns {Promise<Object>}
     */
    async analyzeImage(file) {
      this.validateFile(file);
      const img = await ImageUtils.loadImage(file);
      return ImageAnalyzer.analyze(img, file);
    }

    /**
     * Check format support
     * @param {string} format
     * @returns {boolean}
     */
    isFormatSupported(format) {
      if (format === ImageFormat.WEBP) {
        return ImageUtils.isWebPSupported();
      }
      return Object.values(ImageFormat).includes(format);
    }

    // ==================== PRIVATE METHODS ====================

    async _processVersions(img, file, presets, analysis, opts, jobId) {
      const versions = [];

      for (let i = 0; i < presets.length; i++) {
        const preset = presets[i];
        const versionStartTime = performance.now();

        try {
          // Calculate dimensions
          const dimensions = ImageUtils.calculateDimensions(
            img.width,
            img.height,
            preset.maxDimension,
            preset.aspectRatio
          );

          // Create optimized canvas
          const canvas = CompressionEngine.createOptimizedCanvas(
            img,
            dimensions,
            analysis
          );

          // Determine output format
          const outputFormat = opts.outputFormat || analysis.suggestedFormat;

          // Compress with intelligent algorithm
          let blob = await CompressionEngine.compress(
            canvas,
            outputFormat,
            preset.targetSize,
            analysis,
            opts.quality
          );

          // Advanced optimization if needed
          if (blob.size > preset.targetSize * 1.15) {
            blob = await CompressionEngine.advancedOptimize(
              canvas,
              outputFormat,
              preset.targetSize,
              analysis
            );
          }

          const versionTime = performance.now() - versionStartTime;

          // Generate metadata
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
            dataUrl: null, // Can be generated on demand
          };

          versions.push(version);

          // Emit version complete
          this.emit(EventType.VERSION_COMPLETE, {
            jobId,
            versionIndex: i,
            totalVersions: presets.length,
            metadata,
          });
        } catch (error) {
          console.error(`Failed to create version ${i}:`, error);
          // Continue with other versions
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
        // Version info
        versionIndex: index,
        presetName: typeof preset === "string" ? preset : "custom",

        // Size metrics
        originalSize,
        compressedSize,
        saved,
        originalSizeKB: parseFloat((originalSize / 1024).toFixed(2)),
        compressedSizeKB: parseFloat((compressedSize / 1024).toFixed(2)),
        savedKB: parseFloat((saved / 1024).toFixed(2)),
        originalSizeMB: parseFloat((originalSize / 1024 / 1024).toFixed(4)),
        compressedSizeMB: parseFloat((compressedSize / 1024 / 1024).toFixed(4)),
        savedMB: parseFloat((saved / 1024 / 1024).toFixed(4)),

        // Compression metrics
        compressionRatio: parseFloat(ratio.toFixed(2)),
        compressionRatioFormatted: `${ratio.toFixed(2)}%`,
        sizeReduction: parseFloat((compressedSize / originalSize).toFixed(4)),
        efficiency: ratio > 0 ? "good" : ratio > 50 ? "excellent" : "moderate",

        // Dimension metrics
        width: dimensions.width,
        height: dimensions.height,
        dimensions: `${dimensions.width}x${dimensions.height}`,
        aspectRatio: parseFloat(dimensions.aspectRatio.toFixed(3)),
        scale: parseFloat(dimensions.scale.toFixed(4)),
        resolutionReduction: parseFloat((1 - dimensions.scale).toFixed(4)),

        // Format info
        inputFormat: file.type,
        outputFormat: format,
        formatChanged: file.type !== format,

        // Performance
        compressionTime: parseFloat(time.toFixed(2)),
        compressionTimeFormatted: `${time.toFixed(2)}ms`,
        throughput: parseFloat(
          (originalSize / 1024 / (time / 1000)).toFixed(2)
        ),
        throughputFormatted: `${(originalSize / 1024 / (time / 1000)).toFixed(
          2
        )} KB/s`,

        // Quality info
        quality: analysis.recommendedQuality
          ? `${(analysis.recommendedQuality * 100).toFixed(0)}%`
          : "auto",
        qualityScore: parseFloat(
          (analysis.recommendedQuality * 100).toFixed(0)
        ),

        // Analysis summary
        imageType: analysis.imageType,
        complexity: analysis.complexity,
        compressibility: analysis.compressibility,
        hasTransparency: analysis.hasTransparency,

        // Timestamps
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

  // Constants export
  UltraCompressPro.VERSION = VERSION;
  UltraCompressPro.CompressionQuality = CompressionQuality;
  UltraCompressPro.ImageFormat = ImageFormat;
  UltraCompressPro.ProcessingStatus = ProcessingStatus;
  UltraCompressPro.EventType = EventType;

  // Utility classes export
  UltraCompressPro.Utils = ImageUtils;
  UltraCompressPro.Analyzer = ImageAnalyzer;
  UltraCompressPro.Engine = CompressionEngine;

  // Console initialization message
  if (typeof console !== "undefined") {
    console.log(
      `%c🚀 UltraCompressPro v${VERSION} loaded successfully`,
      "color: #10b981; font-size: 14px; font-weight: bold;"
    );
  }

  return UltraCompressPro;
});
// ======================================================================
// ==================== CUSTOM APP COMPRESSOR WRAPPER ===================
// ======================================================================
// Lớp tùy chỉnh để phục vụ riêng cho ứng dụng của bạn.
// PHIÊN BẢN 2.0 - TÍCH HỢP BÁO CÁO TIẾN TRÌNH

class AppImageCompressor {
  constructor() {
    this.compressor = new UltraCompressPro({
      defaultQuality: "aggressive",
    });

    this.presetSmall = {
      maxDimension: 420,
      targetSize: 15 * 1024,
      aspectRatio: 4 / 3,
    };

    this.presetLarge = {
      maxDimension: 864,
      targetSize: 28 * 1024,
      aspectRatio: 4 / 3,
    };
  }

  /**
   * Xử lý một ảnh duy nhất, kiểm tra tỷ lệ 4:3 và xuất ra 2 phiên bản.
   * @param {File} file - Tệp ảnh đầu vào.
   * @param {Function} [onProgress] - (TÙY CHỌN) Callback để nhận tiến trình. Ví dụ: (progress) => console.log(progress.percent)
   * @returns {Promise<Object>} - Promise trả về đối tượng chứa 2 phiên bản ảnh hoặc lỗi.
   */
  async processImage(file, onProgress) {
    // Hàm trợ giúp để gửi tiến trình một cách an toàn
    const reportProgress = (percent, message) => {
      if (onProgress && typeof onProgress === "function") {
        onProgress({ percent, message });
      }
    };

    try {
      reportProgress(5, "Đang xác thực tệp...");
      this.compressor.validateFile(file);

      reportProgress(15, "Đang đọc và kiểm tra tỷ lệ ảnh...");
      const img = await UltraCompressPro.Utils.loadImage(file);
      const aspectRatio = img.width / img.height;
      const targetAspectRatio = 4 / 3;

      if (Math.abs(aspectRatio - targetAspectRatio) > 0.01) {
        throw new Error(
          `Ảnh phải có tỷ lệ 4:3. Tỷ lệ hiện tại là ${aspectRatio.toFixed(2)}:1`
        );
      }

      // Lắng nghe sự kiện từ thư viện gốc để báo cáo tiến trình nén
      const progressListener = (versionData) => {
        // Quy trình nén chiếm khoảng 70% tổng thời gian (từ 20% đến 90%)
        const baseProgress = 20;
        const compressionWorkload = 70;
        const progress =
          baseProgress +
          (compressionWorkload / 2) * (versionData.versionIndex + 1);
        reportProgress(
          Math.round(progress),
          `Đã nén xong phiên bản ${versionData.versionIndex + 1}/2...`
        );
      };

      this.compressor.on("version_complete", progressListener);

      reportProgress(20, "Bắt đầu nén thông minh...");
      const result = await this.compressor.compress(file, {
        customPresets: [this.presetLarge, this.presetSmall],
      });

      // Rất quan trọng: Gỡ bỏ listener sau khi hoàn tất để tránh rò rỉ bộ nhớ
      this.compressor.off("version_complete", progressListener);

      if (!result.success || result.versions.length < 2) {
        throw new Error("Không thể tạo đủ 2 phiên bản ảnh.");
      }

      reportProgress(95, "Đang hoàn tất kết quả...");

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
      reportProgress(100, `Lỗi: ${error.message}`); // Báo cáo lỗi qua progress
      return { success: false, error: error.message };
    }
  }
}
