
"use strict";

const $ = (id) => document.getElementById(id);

const fileInput = $("fileInput");
const dropzone = $("dropzone");
const selectedFile = $("selectedFile");
const fileName = $("fileName");
const fileDetails = $("fileDetails");
const removeButton = $("removeButton");

const targetSize = $("targetSize");
const outputFormat = $("outputFormat");
const quality = $("quality");
const qualityValue = $("qualityValue");
const qualityHelp = $("qualityHelp");
const qualityCard = $("qualityCard");
const allowResize = $("allowResize");
const resizeOptions = $("resizeOptions");
const maxWidth = $("maxWidth");

const compressButton = $("compressButton");
const buttonText = $("buttonText");
const formatWarning = $("formatWarning");

const results = $("results");
const resultSubtitle = $("resultSubtitle");
const originalSize = $("originalSize");
const compressedSize = $("compressedSize");
const reduction = $("reduction");
const originalDimensions = $("originalDimensions");
const compressedDimensions = $("compressedDimensions");
const originalPreview = $("originalPreview");
const compressedPreview = $("compressedPreview");
const resultMessage = $("resultMessage");
const downloadButton = $("downloadButton");
const startOverButton = $("startOverButton");

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 30_000_000;
const MIN_QUALITY = 0.15;
const MIN_RESIZE_WIDTH = 320;
const MAX_CANVAS_SIDE = 12000;

let selectedImage = null;
let originalObjectUrl = null;
let compressedObjectUrl = null;
let resultBlob = null;
let resultExtension = "";
let isProcessing = false;
let operationId = 0;
let fileSelectionId = 0;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDimensions(width, height) {
  return `${width.toLocaleString()} × ${height.toLocaleString()} px`;
}

function showWarning(message, isError = false) {
  formatWarning.textContent = message;
  formatWarning.classList.remove("hidden", "error");

  if (isError) {
    formatWarning.classList.add("error");
  }
}

function hideWarning() {
  formatWarning.textContent = "";
  formatWarning.classList.add("hidden");
  formatWarning.classList.remove("error");
}

function setResultMessage(message, type = "") {
  resultMessage.textContent = message;
  resultMessage.className = "result-message";

  if (type) {
    resultMessage.classList.add(type);
  }
}

function updateQualityUI() {
  const value = Number(quality.value);
  qualityValue.textContent = `${value}%`;

  const isPng = outputFormat.value === "image/png";

  qualityCard.style.opacity = isPng ? "0.5" : "1";
  qualityHelp.textContent = isPng
    ? "PNG is lossless. The quality slider does not control PNG file size."
    : `Maximum quality preference: ${value}%. The app searches for a suitable quality up to this limit.`;
}

function updateFormatWarning() {
  if (!selectedImage) {
    hideWarning();
    return;
  }

  if (
    outputFormat.value === "image/jpeg" &&
    selectedImage.file.type === "image/png"
  ) {
    showWarning(
      "JPEG does not support transparency. Transparent areas will be filled with white."
    );
    return;
  }

  if (outputFormat.value === "image/png") {
    showWarning(
      "PNG is lossless and may not reach your target size. Resizing is optional."
    );
    return;
  }

  hideWarning();
}

function revokeUrl(url) {
  if (url) {
    URL.revokeObjectURL(url);
  }
}

function resetResult() {
  revokeUrl(compressedObjectUrl);
  compressedObjectUrl = null;
  resultBlob = null;
  resultExtension = "";

  results.classList.add("hidden");
  compressedPreview.removeAttribute("src");

  compressedSize.textContent = "—";
  compressedDimensions.textContent = "—";
  reduction.textContent = "—";

  setResultMessage("");
}

function setBusy(busy) {
  isProcessing = busy;

  compressButton.disabled = busy || !selectedImage;
  fileInput.disabled = busy;
  removeButton.disabled = busy;
  outputFormat.disabled = busy;
  targetSize.disabled = busy;
  quality.disabled = busy;
  allowResize.disabled = busy;
  maxWidth.disabled = busy;

  buttonText.textContent = busy
    ? "Compressing image…"
    : "Compress image";
}

function clearSelectedImage() {
  if (isProcessing) return;

  // Invalidate any file that is still loading.
  fileSelectionId++;
  operationId++;

  selectedImage = null;

  revokeUrl(originalObjectUrl);
  originalObjectUrl = null;

  resetResult();

  selectedFile.classList.add("hidden");
  dropzone.classList.remove("hidden");

  fileInput.value = "";
  originalPreview.removeAttribute("src");

  originalSize.textContent = "—";
  originalDimensions.textContent = "—";

  compressButton.disabled = true;
  hideWarning();
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) {
        revokeUrl(url);
        reject(new Error("This image has invalid dimensions."));
        return;
      }

      resolve({
        img,
        url,
        width: img.naturalWidth,
        height: img.naturalHeight
      });
    };

    img.onerror = () => {
      revokeUrl(url);

      reject(
        new Error(
          "Chrome could not read this image. Try another JPG, PNG or WebP file."
        )
      );
    };

    img.src = url;
  });
}

async function selectFile(file) {
  if (isProcessing || !file) return;

  const requestId = ++fileSelectionId;
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp"
  ];

  // Allow the same file to be selected again later.
  fileInput.value = "";

  if (!allowedTypes.includes(file.type)) {
    showWarning(
      "Unsupported file. Please select a JPG, PNG or WebP image.",
      true
    );
    return;
  }

  if (file.size > MAX_FILE_BYTES) {
    showWarning(
      "This image exceeds the 20 MB limit. Please choose a smaller file.",
      true
    );
    return;
  }

  if (file.size === 0) {
    showWarning("This file is empty. Please choose another image.", true);
    return;
  }

  hideWarning();

  let loaded = null;

  try {
    loaded = await loadImage(file);

    // Ignore outdated selections when multiple files are chosen quickly.
    if (requestId !== fileSelectionId || isProcessing) {
      revokeUrl(loaded.url);
      return;
    }

    clearSelectedImage();

    selectedImage = {
      file,
      img: loaded.img,
      width: loaded.width,
      height: loaded.height
    };

    originalObjectUrl = loaded.url;

    dropzone.classList.add("hidden");
    selectedFile.classList.remove("hidden");

    fileName.textContent = file.name;
    fileDetails.textContent =
      `${formatBytes(file.size)} · ${formatDimensions(loaded.width, loaded.height)}`;

    originalPreview.src = loaded.url;
    originalSize.textContent = formatBytes(file.size);
    originalDimensions.textContent =
      formatDimensions(loaded.width, loaded.height);

    compressButton.disabled = false;

    updateFormatWarning();
  } catch (error) {
    if (requestId === fileSelectionId) {
      showWarning(
        error.message || "Unable to load this image.",
        true
      );
    }
  }
}

function isSafeDimensions(width, height) {
  return (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width >= 1 &&
    height >= 1 &&
    width <= MAX_CANVAS_SIDE &&
    height <= MAX_CANVAS_SIDE &&
    width * height <= MAX_IMAGE_PIXELS
  );
}

function dimensionsForWidth(width, originalWidth, originalHeight) {
  const height = Math.max(
    1,
    Math.round(width * originalHeight / originalWidth)
  );

  return { width, height };
}

function getSafeMaximumWidth(originalWidth, originalHeight) {
  const aspectRatio = originalHeight / originalWidth;

  const widthForSideLimit = MAX_CANVAS_SIDE / aspectRatio;
  const widthForPixelLimit = Math.sqrt(
    MAX_IMAGE_PIXELS / aspectRatio
  );

  return Math.floor(
    Math.min(
      originalWidth,
      MAX_CANVAS_SIDE,
      widthForSideLimit,
      widthForPixelLimit
    )
  );
}

function makeCanvas(img, width, height, mimeType) {
  const w = Math.round(width);
  const h = Math.round(height);

  if (!isSafeDimensions(w, h)) {
    throw new Error(
      "This image is too large to process safely at its current dimensions. Enable resizing and choose a smaller maximum width."
    );
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  let ctx;

  try {
    ctx = canvas.getContext("2d", {
      alpha: mimeType !== "image/jpeg"
    });
  } catch {
    canvas.width = 0;
    canvas.height = 0;

    throw new Error("Your browser could not create an image canvas.");
  }

  if (!ctx) {
    canvas.width = 0;
    canvas.height = 0;

    throw new Error("Your browser could not create an image canvas.");
  }

  if (mimeType === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  }

  ctx.drawImage(img, 0, 0, w, h);

  return canvas;
}

function canvasToBlob(canvas, mimeType, q) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(
              new Error("Image encoding failed. Try another format.")
            );
            return;
          }

          if (blob.type !== mimeType) {
            reject(
              new Error(
                `Your browser could not create ${mimeType}. Try WebP or JPEG instead.`
              )
            );
            return;
          }

          resolve(blob);
        },
        mimeType,
        q
      );
    } catch {
      reject(
        new Error(
          "The browser could not encode this image. Try a smaller image."
        )
      );
    }
  });
}

async function encodeAtQuality(
  canvas,
  mimeType,
  targetBytes,
  maxQuality
) {
  const highBlob = await canvasToBlob(
    canvas,
    mimeType,
    maxQuality
  );

  if (highBlob.size <= targetBytes) {
    return {
      blob: highBlob,
      quality: maxQuality,
      targetReached: true
    };
  }

  const lowBlob = await canvasToBlob(
    canvas,
    mimeType,
    MIN_QUALITY
  );

  if (lowBlob.size > targetBytes) {
    return {
      blob: lowBlob,
      quality: MIN_QUALITY,
      targetReached: false
    };
  }

  let low = MIN_QUALITY;
  let high = maxQuality;
  let bestBlob = lowBlob;
  let bestQuality = low;

  // Find a high-quality result that fits the target.
  for (let i = 0; i < 8; i++) {
    const mid = (low + high) / 2;

    const blob = await canvasToBlob(
      canvas,
      mimeType,
      mid
    );

    if (blob.size <= targetBytes) {
      bestBlob = blob;
      bestQuality = mid;
      low = mid;
    } else {
      high = mid;
    }
  }

  return {
    blob: bestBlob,
    quality: bestQuality,
    targetReached: bestBlob.size <= targetBytes
  };
}

async function encodeCanvas(
  canvas,
  mimeType,
  targetBytes,
  maxQuality
) {
  if (mimeType === "image/png") {
    const blob = await canvasToBlob(canvas, mimeType);

    return {
      blob,
      quality: null,
      targetReached: blob.size <= targetBytes
    };
  }

  return encodeAtQuality(
    canvas,
    mimeType,
    targetBytes,
    maxQuality
  );
}

function getCandidateWidths(
  originalWidth,
  originalHeight,
  resizeLimit
) {
  const safeWidth = getSafeMaximumWidth(
    originalWidth,
    originalHeight
  );

  const startingWidth = Math.floor(
    Math.min(originalWidth, resizeLimit, safeWidth)
  );

  if (startingWidth < 1) {
    throw new Error(
      "This image's proportions prevent safe resizing. Try another image."
    );
  }

  const widths = [];
  let width = startingWidth;

  while (true) {
    if (!widths.includes(width)) {
      widths.push(width);
    }

    if (width <= MIN_RESIZE_WIDTH) break;

    const nextWidth = Math.max(
      MIN_RESIZE_WIDTH,
      Math.floor(width * 0.85)
    );

    if (nextWidth === width) break;

    width = nextWidth;
  }

  return widths;
}

async function compressImage() {
  if (!selectedImage || isProcessing) return;

  const targetKB = Number(targetSize.value);

  if (
    !Number.isFinite(targetKB) ||
    targetKB < 1 ||
    targetKB > 20000
  ) {
    showWarning(
      "Enter a target size between 1 KB and 20,000 KB.",
      true
    );
    return;
  }

  const resizeLimit = Number(maxWidth.value);

  if (
    allowResize.checked &&
    (
      !Number.isFinite(resizeLimit) ||
      resizeLimit < 100 ||
      resizeLimit > 12000
    )
  ) {
    showWarning(
      "Maximum width must be between 100 and 12,000 pixels.",
      true
    );
    return;
  }

  const thisOperation = ++operationId;

  // Snapshot the selected image and settings for this operation.
  const file = selectedImage.file;
  const img = selectedImage.img;
  const originalWidth = selectedImage.width;
  const originalHeight = selectedImage.height;
  const mimeType = outputFormat.value;
  const targetBytes = Math.round(targetKB * 1024);
  const maxQuality = Number(quality.value) / 100;
  const resizingEnabled = allowResize.checked;

  setBusy(true);
  resetResult();
  hideWarning();

  try {
    let finalResult = null;
    let finalWidth = originalWidth;
    let finalHeight = originalHeight;
    let resizeAttempted = false;

    const originalIsSafe = isSafeDimensions(
      originalWidth,
      originalHeight
    );

    if (!originalIsSafe && !resizingEnabled) {
      throw new Error(
        "This image is too large to process safely at its original dimensions. Enable resizing and try again."
      );
    }

    // Preserve original dimensions whenever safely possible.
    if (originalIsSafe) {
      const originalCanvas = makeCanvas(
        img,
        originalWidth,
        originalHeight,
        mimeType
      );

      try {
        finalResult = await encodeCanvas(
          originalCanvas,
          mimeType,
          targetBytes,
          maxQuality
        );
      } finally {
        // Release canvas memory as soon as encoding finishes.
        originalCanvas.width = 0;
        originalCanvas.height = 0;
      }
    }

    // Resize only when the user enabled it and the target
    // has not been reached, or the original is too large.
    if (
      resizingEnabled &&
      (!finalResult || !finalResult.targetReached)
    ) {
      resizeAttempted = true;

      const candidateWidths = getCandidateWidths(
        originalWidth,
        originalHeight,
        resizeLimit
      );

      for (const candidateWidth of candidateWidths) {
        if (thisOperation !== operationId) return;

        const dimensions = dimensionsForWidth(
          candidateWidth,
          originalWidth,
          originalHeight
        );

        const canvas = makeCanvas(
          img,
          dimensions.width,
          dimensions.height,
          mimeType
        );

        let candidate;

        try {
          candidate = await encodeCanvas(
            canvas,
            mimeType,
            targetBytes,
            maxQuality
          );
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }

        if (
          !finalResult ||
          candidate.blob.size < finalResult.blob.size
        ) {
          finalResult = candidate;
          finalWidth = dimensions.width;
          finalHeight = dimensions.height;
        }

        if (candidate.targetReached) {
          finalResult = candidate;
          finalWidth = dimensions.width;
          finalHeight = dimensions.height;
          break;
        }
      }
    }

    if (thisOperation !== operationId) return;

    if (!finalResult) {
      throw new Error("No compressed image could be produced.");
    }

    resultBlob = finalResult.blob;

    resultExtension =
      mimeType === "image/jpeg"
        ? "jpg"
        : mimeType === "image/png"
          ? "png"
          : "webp";

    compressedObjectUrl = URL.createObjectURL(resultBlob);
    compressedPreview.src = compressedObjectUrl;

    compressedSize.textContent = formatBytes(resultBlob.size);
    compressedDimensions.textContent =
      formatDimensions(finalWidth, finalHeight);

    originalSize.textContent = formatBytes(file.size);
    originalDimensions.textContent =
      formatDimensions(originalWidth, originalHeight);

    const difference = file.size - resultBlob.size;
    const percentage = (difference / file.size) * 100;

    if (difference > 0) {
      reduction.textContent = `${percentage.toFixed(1)}%`;
    } else if (difference < 0) {
      reduction.textContent =
        `+${Math.abs(percentage).toFixed(1)}%`;
    } else {
      reduction.textContent = "0%";
    }

    const targetReached = resultBlob.size <= targetBytes;

    const dimensionsChanged =
      finalWidth !== originalWidth ||
      finalHeight !== originalHeight;

    const messages = [];

    if (targetReached) {
      messages.push(
        `Target reached: the final file is ${formatBytes(resultBlob.size)}, within your ${targetKB} KB limit.`
      );
    } else {
      messages.push(
        `Target not reached: the final file is ${formatBytes(resultBlob.size)}. Your requested limit was ${targetKB} KB.`
      );
    }

    if (difference > 0) {
      messages.push(
        `You saved ${formatBytes(difference)} (${percentage.toFixed(1)}% smaller than the original).`
      );
    } else if (difference < 0) {
      messages.push(
        `The output is ${formatBytes(-difference)} (${Math.abs(percentage).toFixed(1)}%) larger than the original. This can happen when converting formats.`
      );
    } else {
      messages.push(
        "The output file is the same size as the original."
      );
    }

    if (mimeType === "image/png") {
      messages.push(
        "PNG is lossless; the quality slider does not control its file size."
      );
    } else {
      messages.push(
        `Maximum quality preference: ${quality.value}%. Actual quality and size depend on the image and browser encoder.`
      );
    }

    if (dimensionsChanged) {
      messages.push(
        `Resizing changed the dimensions from ${formatDimensions(originalWidth, originalHeight)} to ${formatDimensions(finalWidth, finalHeight)}.`
      );
    } else {
      messages.push(
        "Original dimensions preserved."
      );
    }

    if (!targetReached) {
      messages.push(
        resizingEnabled
          ? "Try a larger target size. The tested resize options did not reach your target."
          : "Try a larger target size, another output format, or enable resizing if smaller dimensions are acceptable."
      );
    }

    if (
      mimeType === "image/jpeg" &&
      file.type === "image/png"
    ) {
      messages.push(
        "Transparent areas were filled with white because JPEG does not support transparency."
      );
    }

    resultSubtitle.textContent = targetReached
      ? "Compression finished"
      : "Best available result — target not reached";

    setResultMessage(
      messages.join(" "),
      targetReached ? "success" : "warning"
    );

    results.classList.remove("hidden");

    results.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  } catch (error) {
    if (thisOperation === operationId) {
      showWarning(
        error.message || "Something went wrong while compressing.",
        true
      );
    }
  } finally {
    if (thisOperation === operationId) {
      setBusy(false);
    }
  }
}

function downloadResult() {
  if (!resultBlob || !selectedImage) return;

  const baseName = selectedImage.file.name.replace(/\.[^.]+$/, "");
  const safeName = baseName || "image";
  const url = URL.createObjectURL(resultBlob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${safeName}-compressed.${resultExtension}`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  // Give the browser time to begin the download.
  window.setTimeout(() => {
    revokeUrl(url);
  }, 30000);
}

function startOver() {
  if (isProcessing) return;

  clearSelectedImage();

  targetSize.value = "200";
  outputFormat.value = "image/webp";
  quality.value = "85";
  allowResize.checked = false;
  maxWidth.value = "1920";

  resizeOptions.classList.add("hidden");

  updateQualityUI();
  hideWarning();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

fileInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];

  if (file) {
    selectFile(file);
  }
});

removeButton.addEventListener("click", clearSelectedImage);

compressButton.addEventListener("click", compressImage);
downloadButton.addEventListener("click", downloadResult);
startOverButton.addEventListener("click", startOver);

quality.addEventListener("input", updateQualityUI);

outputFormat.addEventListener("change", () => {
  updateQualityUI();
  updateFormatWarning();
});

allowResize.addEventListener("change", () => {
  resizeOptions.classList.toggle(
    "hidden",
    !allowResize.checked
  );

  updateFormatWarning();
});

targetSize.addEventListener("input", () => {
  const value = Number(targetSize.value);

  if (
    targetSize.value &&
    (!Number.isFinite(value) || value < 1 || value > 20000)
  ) {
    targetSize.setCustomValidity(
      "Target size must be between 1 and 20,000 KB."
    );
  } else {
    targetSize.setCustomValidity("");
  }
});

dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();

  if (!isProcessing) {
    dropzone.classList.add("dragging");
  }
});

dropzone.addEventListener("dragleave", (event) => {
  if (!dropzone.contains(event.relatedTarget)) {
    dropzone.classList.remove("dragging");
  }
});

dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("dragging");

  if (isProcessing) return;

  const file = event.dataTransfer.files?.[0];

  if (file) {
    selectFile(file);
  }
});

window.addEventListener("beforeunload", () => {
  revokeUrl(originalObjectUrl);
  revokeUrl(compressedObjectUrl);
});

updateQualityUI();
compressButton.disabled = true;
