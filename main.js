// main.js (V20.0 - Enhanced với Progress Bar)
document.addEventListener("DOMContentLoaded", () => {
  // --- Khai báo biến DOM ---
  const imageInput = document.getElementById("imageInput");
  const uploadArea = document.getElementById("upload-area");
  const infoMessage = document.getElementById("infoMessage");
  const resultsArea = document.getElementById("results-area");
  const originalInfo = document.getElementById("originalInfo");
  const resetBtn = document.getElementById("resetBtn");
  const generatedVersionsList = document.getElementById(
    "generatedVersionsList"
  );
  const copyResultsBtn = document.getElementById("copyResultsBtn");
  const previewControls = document.querySelector(".preview-controls");
  const previewImage = document.getElementById("previewImage");
  const previewInfo = document.getElementById("previewInfo");

  // Progress Bar Elements
  const progressContainer = document.getElementById("progressContainer");
  const progressBar = document.getElementById("progressBar");
  const progressPercent = document.getElementById("progressPercent");
  const progressText = document.getElementById("progressText");

  // DOM cho trình crop
  const cropperModal = document.getElementById("cropper-modal");
  const cropperCanvas = document.getElementById("cropper-canvas");
  const cropConfirmBtn = document.getElementById("crop-confirm-btn");
  const cropCancelBtn = document.getElementById("crop-cancel-btn");
  const cropperCtx = cropperCanvas.getContext("2d");

  // --- State của ứng dụng ---
  let compressionResult = null;
  let blobUrls = [];
  const appCompressor = new AppImageCompressor();

  // --- Progress Bar Functions ---
  function showProgress() {
    progressContainer.classList.add("active");
    infoMessage.style.display = "none";
  }

  function hideProgress() {
    progressContainer.classList.remove("active");
    infoMessage.style.display = "block";
  }

  function updateProgress(percent, message) {
    progressBar.style.width = percent + "%";
    progressPercent.textContent = percent + "%";
    progressText.textContent = message;
  }

  // --- Logic Trình Crop ---
  const ZOOM_SENSITIVITY = 1.1;
  let cropState = {
    image: null,
    scale: 1,
    offset: { x: 0, y: 0 },
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    cropBox: { x: 0, y: 0, width: 0, height: 0 },
  };

  function initCropper(imageFile) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        cropState.image = img;
        setupCropperCanvas();
        cropperModal.classList.add("visible");
        requestAnimationFrame(drawCropper);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(imageFile);
  }

  function setupCropperCanvas() {
    const containerWidth = cropperCanvas.parentElement.clientWidth;
    const canvasWidth = Math.min(containerWidth, 800);
    const canvasHeight = canvasWidth * 0.75;
    cropperCanvas.width = canvasWidth;
    cropperCanvas.height = canvasHeight;
    cropState.cropBox.width = canvasWidth * 0.9;
    cropState.cropBox.height = cropState.cropBox.width * (3 / 4);
    cropState.cropBox.x = (canvasWidth - cropState.cropBox.width) / 2;
    cropState.cropBox.y = (canvasHeight - cropState.cropBox.height) / 2;
    const imgAspectRatio = cropState.image.width / cropState.image.height;
    const boxAspectRatio = 4 / 3;
    cropState.scale =
      imgAspectRatio > boxAspectRatio
        ? cropState.cropBox.height / cropState.image.height
        : cropState.cropBox.width / cropState.image.width;
    cropState.offset.x =
      (canvasWidth - cropState.image.width * cropState.scale) / 2;
    cropState.offset.y =
      (canvasHeight - cropState.image.height * cropState.scale) / 2;
  }

  function drawCropper() {
    cropperCtx.clearRect(0, 0, cropperCanvas.width, cropperCanvas.height);
    cropperCtx.drawImage(
      cropState.image,
      cropState.offset.x,
      cropState.offset.y,
      cropState.image.width * cropState.scale,
      cropState.image.height * cropState.scale
    );
    cropperCtx.fillStyle = "rgba(0, 0, 0, 0.6)";
    cropperCtx.beginPath();
    cropperCtx.rect(0, 0, cropperCanvas.width, cropperCanvas.height);
    cropperCtx.rect(
      cropState.cropBox.x,
      cropState.cropBox.y,
      cropState.cropBox.width,
      cropState.cropBox.height
    );
    cropperCtx.fill("evenodd");
  }

  function getEventPosition(event) {
    const rect = cropperCanvas.getBoundingClientRect();
    const touch = event.touches ? event.touches[0] : event;
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }

  function onPointerDown(e) {
    e.preventDefault();
    cropState.isDragging = true;
    cropState.dragStart = getEventPosition(e);
  }
  function onPointerMove(e) {
    if (!cropState.isDragging) return;
    e.preventDefault();
    const pos = getEventPosition(e);
    const dx = pos.x - cropState.dragStart.x;
    const dy = pos.y - cropState.dragStart.y;
    cropState.offset.x += dx;
    cropState.offset.y += dy;
    cropState.dragStart = pos;
    requestAnimationFrame(drawCropper);
  }
  function onPointerUp() {
    if (!cropState.isDragging) return;
    cropState.isDragging = false;
    const { image, offset, scale, cropBox } = cropState;
    const scaledWidth = image.width * scale;
    const scaledHeight = image.height * scale;
    offset.x = Math.min(
      cropBox.x,
      Math.max(offset.x, cropBox.x + cropBox.width - scaledWidth)
    );
    offset.y = Math.min(
      cropBox.y,
      Math.max(offset.y, cropBox.y + cropBox.height - scaledHeight)
    );
    requestAnimationFrame(drawCropper);
  }
  function onWheel(e) {
    e.preventDefault();
    const pos = getEventPosition(e);
    const delta = e.deltaY > 0 ? 1 / ZOOM_SENSITIVITY : ZOOM_SENSITIVITY;
    const newScale = cropState.scale * delta;
    const minScale = Math.max(
      cropState.cropBox.width / cropState.image.width,
      cropState.cropBox.height / cropState.image.height
    );
    if (newScale < minScale) return;
    cropState.offset.x = pos.x - (pos.x - cropState.offset.x) * delta;
    cropState.offset.y = pos.y - (pos.y - cropState.offset.y) * delta;
    cropState.scale = newScale;
    onPointerUp();
    requestAnimationFrame(drawCropper);
  }

  cropperCanvas.addEventListener("mousedown", onPointerDown);
  cropperCanvas.addEventListener("mousemove", onPointerMove);
  window.addEventListener("mouseup", onPointerUp);
  cropperCanvas.addEventListener("mouseleave", onPointerUp);
  cropperCanvas.addEventListener("wheel", onWheel, { passive: false });
  cropperCanvas.addEventListener("touchstart", onPointerDown);
  cropperCanvas.addEventListener("touchmove", onPointerMove);
  window.addEventListener("touchend", onPointerUp);

  async function handleCropConfirm() {
    const { image, scale, offset, cropBox } = cropState;
    const sourceX = (cropBox.x - offset.x) / scale;
    const sourceY = (cropBox.y - offset.y) / scale;
    const sourceWidth = cropBox.width / scale;
    const sourceHeight = cropBox.height / scale;
    const finalCanvas = new OffscreenCanvas(sourceWidth, sourceHeight);
    finalCanvas
      .getContext("2d")
      .drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        sourceWidth,
        sourceHeight
      );
    const blob = await finalCanvas.convertToBlob({ type: "image/png" });
    const croppedFile = new File([blob], "cropped_image.png", {
      type: "image/png",
    });
    cropperModal.classList.remove("visible");
    startCompression(croppedFile);
  }

  cropConfirmBtn.addEventListener("click", handleCropConfirm);
  cropCancelBtn.addEventListener("click", () => {
    cropperModal.classList.remove("visible");
    resetUI();
  });

  // --- Logic Chính của Ứng dụng ---

  function formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  function resetUI() {
    infoMessage.textContent = "Sẵn sàng để xử lý";
    infoMessage.style.color = "var(--dark-gray)";
    resultsArea.style.display = "none";
    uploadArea.style.display = "flex";
    hideProgress();
    blobUrls.forEach(URL.revokeObjectURL);
    blobUrls = [];
    compressionResult = null;
    imageInput.value = "";
    generatedVersionsList.innerHTML = "";
    previewControls.querySelectorAll(".preview-btn").forEach((btn) => {
      btn.classList.add("disabled");
      btn.classList.remove("active");
    });
  }

  function handleImageUpload(file) {
    if (!file || !file.type.startsWith("image/")) {
      alert("Vui lòng chọn một file ảnh hợp lệ.");
      return;
    }
    resetUI();
    initCropper(file);
  }

  async function startCompression(file) {
    uploadArea.style.display = "none";
    showProgress();
    updateProgress(0, "Đang khởi tạo...");

    // Callback để nhận tiến trình từ compressor
    const onProgress = (progress) => {
      updateProgress(progress.percent, progress.message);
    };

    const result = await appCompressor.processImage(file, onProgress);

    if (result.success) {
      compressionResult = result;
      updateProgress(100, "Hoàn tất!");
      setTimeout(() => {
        hideProgress();
        displayResults();
        infoMessage.textContent = "Nén thành công!";
        infoMessage.style.color = "var(--success-color)";
      }, 500);
    } else {
      hideProgress();
      infoMessage.textContent = `Lỗi: ${result.error}`;
      infoMessage.style.color = "red";
      resultsArea.style.display = "block";
    }
  }

  function displayResults() {
    originalInfo.innerHTML = `
      <li><span>Định dạng gốc:</span> <span>${
        compressionResult.original.name
      }</span></li>
      <li><span>Kích thước gốc:</span> <span>${
        compressionResult.original.width
      }x${compressionResult.original.height} px</span></li>
      <li><span>Dung lượng gốc:</span> <span>${formatBytes(
        compressionResult.original.size
      )}</span></li>
    `;

    generatedVersionsList.innerHTML = "";
    const versions = [
      { name: "Lớn", data: compressionResult.large },
      { name: "Nhỏ", data: compressionResult.small },
    ];

    versions.forEach((version) => {
      const metadata = version.data.metadata;
      const card = document.createElement("div");
      card.className = "version-card";
      card.innerHTML = `
          <h4>Phiên bản ${version.name}</h4>
          <ul>
            <li><span>Kích thước:</span> <span>${metadata.width}x${
        metadata.height
      } px</span></li>
            <li><span>Dung lượng:</span> <span><b>${formatBytes(
              metadata.compressedSize
            )}</b></span></li>
            <li><span>Tỷ lệ nén:</span> <span>${
              metadata.compressionRatio
            }%</span></li>
          </ul>
          <a href="${
            version.data.url
          }" download="compressed_${version.name.toLowerCase()}.webp" class="btn download-version-btn">Tải bản '${
        version.name
      }'</a>
        `;
      generatedVersionsList.appendChild(card);
    });

    previewControls
      .querySelectorAll(".preview-btn")
      .forEach((btn) => btn.classList.remove("disabled"));
    resultsArea.style.display = "block";
    previewControls.querySelector('[data-device="large"]').click();
  }

  previewControls.addEventListener("click", (e) => {
    if (!e.target.matches(".preview-btn:not(.disabled)") || !compressionResult)
      return;

    previewControls
      .querySelectorAll(".preview-btn")
      .forEach((btn) => btn.classList.remove("active"));
    e.target.classList.add("active");

    const device = e.target.dataset.device;
    const targetVersion = compressionResult[device];

    previewImage.src = targetVersion.url;
    const frameDeviceMap = { large: "web", small: "mobile" };
    document.getElementById(
      "preview-frame"
    ).className = `device-${frameDeviceMap[device]}`;
    previewInfo.textContent = {
      large: "Phiên bản Lớn (864px) cho web/laptop và điện thoại.",
      small: "Phiên bản Nhỏ (420px) cho preview nhỏ, 1/3 màn hình điện thoại.",
    }[device];
  });

  function handleCopyResults() {
    if (!compressionResult) return;
    let report = "--- KẾT QUẢ NÉN ẢNH ---\n\n";
    report += "ẢNH GỐC (SAU KHI CROP):\n";
    report += `- Kích thước: ${compressionResult.original.width}x${compressionResult.original.height} px\n\n`;

    const versions = [
      { name: "LỚN", data: compressionResult.large.metadata },
      { name: "NHỎ", data: compressionResult.small.metadata },
    ];

    versions.forEach((v) => {
      report += `* PHIÊN BẢN ${v.name}:\n`;
      report += `  - Kích thước: ${v.data.width}x${v.data.height} px\n`;
      report += `  - Dung lượng: ${formatBytes(v.data.compressedSize)}\n`;
      report += `  - Tỷ lệ nén: ${v.data.compressionRatio}%\n\n`;
    });

    navigator.clipboard.writeText(report).then(() => {
      const originalText = copyResultsBtn.textContent;
      copyResultsBtn.textContent = "✓ Đã sao chép!";
      setTimeout(() => {
        copyResultsBtn.textContent = originalText;
      }, 2000);
    });
  }

  // --- Gán Event Listeners ---
  imageInput.addEventListener("change", (e) =>
    handleImageUpload(e.target.files[0])
  );
  uploadArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadArea.classList.add("dragover");
  });
  uploadArea.addEventListener("dragleave", () =>
    uploadArea.classList.remove("dragover")
  );
  uploadArea.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadArea.classList.remove("dragover");
    handleImageUpload(e.dataTransfer.files[0]);
  });
  resetBtn.addEventListener("click", resetUI);
  copyResultsBtn.addEventListener("click", handleCopyResults);

  resetUI();
});
