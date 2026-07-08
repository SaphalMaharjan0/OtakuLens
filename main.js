import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';


// --- Global Application State ---
let cropperInstance = null;
let currentImageFile = null; // Can be a File or Blob
let searchHistory = [];
let activeSearchResults = []; // Current list of matches from trace.moe
let activeAnimeDetailsCache = {}; // Cache of AniList metadata by ID to avoid duplicate network hits

// --- DOM Elements ---
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const urlInput = document.getElementById('url-input');
const urlFetchBtn = document.getElementById('url-fetch-btn');
const cropperContainer = document.getElementById('cropper-container');
const cropperImage = document.getElementById('cropper-image');
const resultsEmpty = document.getElementById('results-empty');
const resultsLoading = document.getElementById('results-loading');
const loadingStatusText = document.getElementById('loading-status-text');
const progressFill = document.getElementById('progress-fill');
const resultsContent = document.getElementById('results-content');
const resultsPanel = document.getElementById('results-panel');

// Button controls
const btnRotateLeft = document.getElementById('btn-rotate-left');
const btnRotateRight = document.getElementById('btn-rotate-right');
const btnResetCrop = document.getElementById('btn-reset-crop');
const btnIdentify = document.getElementById('btn-identify');
const btnSauceNAO = document.getElementById('btn-saucenao');
const btnFallbackSauceNAO = document.getElementById('btn-fallback-saucenao');
const btnNewUpload = document.getElementById('btn-new-upload');

// Theme toggle
const themeToggle = document.getElementById('theme-toggle');

// History Drawer Elements
const toggleHistoryBtn = document.getElementById('toggle-history');
const closeHistoryBtn = document.getElementById('close-history');
const historyDrawer = document.getElementById('history-drawer');
const historyOverlay = document.getElementById('history-overlay');
const historyList = document.getElementById('history-list');
const clearHistoryBtn = document.getElementById('clear-history');
const historyCountBadge = document.getElementById('history-count');

// SauceNAO Redirect form
const saucenaoForm = document.getElementById('saucenao-form');
const saucenaoFileInput = document.getElementById('saucenao-file-input');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide Icons
  lucide.createIcons();
  
  // Setup theme
  initTheme();
  
  // Load and render history from localStorage
  loadHistory();
  
  // Set up event listeners
  setupEventListeners();
  
  // Check API health status
  checkApiStatus();
});

// --- Theme Setup ---
function initTheme() {
  const currentTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme);
  updateThemeIcons(currentTheme);
}

function updateThemeIcons(theme) {
  const sunIcon = document.querySelector('.sun-icon');
  const moonIcon = document.querySelector('.moon-icon');
  if (theme === 'dark') {
    sunIcon.classList.remove('hidden');
    moonIcon.classList.add('hidden');
  } else {
    sunIcon.classList.add('hidden');
    moonIcon.classList.remove('hidden');
  }
}

themeToggle.addEventListener('click', () => {
  const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  updateThemeIcons(theme);
});

// --- API Status Check ---
async function checkApiStatus() {
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.querySelector('.status-text');
  try {
    const res = await fetch('https://api.trace.moe/me');
    if (res.ok) {
      statusDot.style.background = 'var(--color-success)';
      statusDot.style.boxShadow = '0 0 8px var(--color-success)';
      statusText.textContent = 'trace.moe API Online';
    } else if (res.status === 429) {
      statusDot.style.background = 'var(--color-warning)';
      statusDot.style.boxShadow = '0 0 8px var(--color-warning)';
      statusText.textContent = 'API Rate Limited';
    } else {
      throw new Error();
    }
  } catch (e) {
    statusDot.style.background = 'var(--color-error)';
    statusDot.style.boxShadow = '0 0 8px var(--color-error)';
    statusText.textContent = 'trace.moe API Offline';
  }
}

// --- Event Listeners Setup ---
function setupEventListeners() {
  // Drag and drop event listeners
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });
  
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleImageFile(files[0]);
    }
  });
  
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      handleImageFile(fileInput.files[0]);
    }
  });
  
  // Clipboard paste listener (Ctrl+V)
  window.addEventListener('paste', (e) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        handleImageFile(file);
        break;
      }
    }
  });

  // URL Input
  urlFetchBtn.addEventListener('click', handleUrlFetch);
  urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleUrlFetch();
  });

  // Cropper Controls
  btnRotateLeft.addEventListener('click', () => {
    if (cropperInstance) cropperInstance.rotate(-90);
  });
  
  btnRotateRight.addEventListener('click', () => {
    if (cropperInstance) cropperInstance.rotate(90);
  });
  
  btnResetCrop.addEventListener('click', () => {
    if (cropperInstance) cropperInstance.reset();
  });
  
  btnIdentify.addEventListener('click', triggerIdentification);

  // SauceNAO fallback search triggers
  btnSauceNAO.addEventListener('click', searchSauceNAO);
  btnFallbackSauceNAO.addEventListener('click', searchSauceNAO);
  btnNewUpload.addEventListener('click', resetUploadInterface);

  // History Drawer Controls
  toggleHistoryBtn.addEventListener('click', toggleHistoryDrawer);
  closeHistoryBtn.addEventListener('click', toggleHistoryDrawer);
  historyOverlay.addEventListener('click', toggleHistoryDrawer);
  clearHistoryBtn.addEventListener('click', clearHistory);
}

// --- Image Handling & Loading ---
function handleImageFile(file) {
  if (!file.type.startsWith('image/')) {
    alert('Please upload an image file (PNG, JPG, WEBP).');
    return;
  }
  currentImageFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    setupCropper(e.target.result);
  };
  reader.readAsDataURL(file);
}

async function handleUrlFetch() {
  const url = urlInput.value.trim();
  if (!url) return;
  
  setLoadingState(true, "Fetching image URL...");
  
  try {
    // Attempt to fetch URL as blob to bypass tainted canvas in cropper
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch image");
    const blob = await res.blob();
    currentImageFile = blob;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      setLoadingState(false);
      setupCropper(e.target.result);
    };
    reader.readAsDataURL(blob);
  } catch (error) {
    console.error(error);
    setLoadingState(false);
    
    // Detailed instructions to copy/paste image directly due to CORS restrictions
    const confirmFallback = confirm(
      "CORS Restriction: The server hosting this image doesn't allow direct external fetching.\n\n" +
      "Would you like to try loading it directly in the cropper? Note: Some crops may fail due to canvas security. " +
      "Alternatively, copy the image to your clipboard and press Ctrl+V."
    );
    
    if (confirmFallback) {
      currentImageFile = null; // Can't export file blob easily if tainted
      setupCropper(url);
    }
  }
}

// --- Cropper.js Wrapper ---
function setupCropper(imageSrc) {
  // Show cropper panel
  cropperContainer.classList.remove('hidden');
  dropZone.classList.add('hidden');
  document.querySelector('.url-input-container').classList.add('hidden');
  
  // Set image source
  cropperImage.src = imageSrc;
  
  // Destroy existing cropper if any
  if (cropperInstance) {
    cropperInstance.destroy();
  }
  
  // Initialize Cropper.js
  cropperInstance = new Cropper(cropperImage, {
    viewMode: 1,
    dragMode: 'move',
    autoCropArea: 0.95,
    restore: false,
    modal: true,
    guides: true,
    highlight: false,
    cropBoxMovable: true,
    cropBoxResizable: true,
    toggleDragModeOnDblclick: false,
    background: false
  });
}

function resetUploadInterface() {
  if (cropperInstance) {
    cropperInstance.destroy();
    cropperInstance = null;
  }
  cropperContainer.classList.add('hidden');
  dropZone.classList.remove('hidden');
  document.querySelector('.url-input-container').classList.remove('hidden');
  urlInput.value = '';
  fileInput.value = '';
  currentImageFile = null;
  
  // Reset results panel
  resultsContent.classList.add('hidden');
  resultsLoading.classList.add('hidden');
  resultsEmpty.classList.remove('hidden');
}

// --- State Helpers ---
function setLoadingState(isLoading, text = "Scanning trace.moe Database...", progressVal = 10) {
  if (isLoading) {
    resultsEmpty.classList.add('hidden');
    resultsContent.classList.add('hidden');
    resultsLoading.classList.remove('hidden');
    loadingStatusText.textContent = text;
    progressFill.style.width = `${progressVal}%`;
    resultsPanel.scrollIntoView({ behavior: 'smooth' });
  } else {
    resultsLoading.classList.add('hidden');
  }
}

// --- search trace.moe & fetch AniList metadata ---
function triggerIdentification() {
  if (!cropperInstance) return;
  
  // Get cropped image as blob
  try {
    cropperInstance.getCroppedCanvas({
      maxWidth: 1920,
      maxHeight: 1080
    }).toBlob(async (blob) => {
      if (!blob) {
        alert("Failed to capture crop canvas.");
        return;
      }
      
      // Update our file payload for SauceNAO fallback search
      currentImageFile = blob;
      
      await performIdentification(blob);
    }, 'image/jpeg', 0.9);
  } catch (error) {
    console.error(error);
    alert(
      "Canvas Tainted! Security features prevent cropping this image because of cross-origin hosting constraints.\n\n" +
      "Tip: Download the image to your device first, then drag and drop it here."
    );
  }
}

async function performIdentification(imageBlob) {
  setLoadingState(true, "Preparing image and uploading...", 20);
  
  try {
    const formData = new FormData();
    formData.append('image', imageBlob);
    
    setLoadingState(true, "Querying trace.moe scene database...", 45);
    
    const response = await fetch('https://api.trace.moe/search', {
      method: 'POST',
      body: formData
    });
    
    if (response.status === 429) {
      throw new Error("RATE_LIMIT");
    }
    
    if (!response.ok) {
      throw new Error("API_ERROR");
    }
    
    const searchData = await response.json();
    
    if (!searchData || !searchData.result || searchData.result.length === 0) {
      throw new Error("NO_RESULTS");
    }
    
    activeSearchResults = searchData.result;
    
    // Fetch detailed info for the primary match
    const primaryMatch = activeSearchResults[0];
    
    setLoadingState(true, `Found matching scenes (similarity: ${(primaryMatch.similarity * 100).toFixed(1)}%). Fetching AniList metadata...`, 75);
    
    const animeDetails = await fetchAnimeDetails(primaryMatch.anilist);
    
    setLoadingState(true, "Rendering results...", 95);
    
    renderMainResult(primaryMatch, animeDetails);
    renderAlternativeMatches(activeSearchResults);
    
    // Save to search history
    saveToHistory(primaryMatch, animeDetails, imageBlob);
    
    // Clear loading state
    setLoadingState(false);
    resultsContent.classList.remove('hidden');
    
  } catch (error) {
    console.error(error);
    setLoadingState(false);
    
    if (error.message === "RATE_LIMIT") {
      alert("Search quota exceeded for trace.moe API (150 scans/day max per IP). Please try again in a few minutes.");
    } else if (error.message === "NO_RESULTS") {
      alert("No matching anime frames found. Try cropping closer, or use SauceNAO to search manga pages.");
    } else {
      alert("Something went wrong during the trace.moe search. Check your internet connection and try again.");
    }
    
    resultsEmpty.classList.remove('hidden');
  }
}

// Fetch detailed metadata from AniList GraphQL API
async function fetchAnimeDetails(anilistId) {
  // Return cached result if available to save bandwidth
  if (activeAnimeDetailsCache[anilistId]) {
    return activeAnimeDetailsCache[anilistId];
  }
  
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        idMal
        title {
          romaji
          english
          native
        }
        description
        coverImage {
          large
          extraLarge
        }
        bannerImage
        genres
        format
        season
        seasonYear
        studios(isMain: true) {
          nodes {
            name
          }
        }
      }
    }
  `;
  
  try {
    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        query: query,
        variables: { id: anilistId }
      })
    });
    
    if (!response.ok) {
      throw new Error("AniList Fetch Error");
    }
    
    const resJson = await response.json();
    const media = resJson.data?.Media || null;
    
    if (media) {
      // Cache details
      activeAnimeDetailsCache[anilistId] = media;
    }
    
    return media;
  } catch (err) {
    console.error("Failed to query AniList GraphQL API:", err);
    return null; // Fallback gracefully if AniList goes down
  }
}

// --- Result Rendering ---
function renderMainResult(match, animeInfo) {
  const romajiTitle = animeInfo?.title?.romaji || match.filename || 'Unknown Anime';
  const englishTitle = animeInfo?.title?.english || '';
  const nativeTitle = animeInfo?.title?.native || '';
  
  // Title mapping
  document.getElementById('result-title-romaji').textContent = romajiTitle;
  document.getElementById('result-title-english').textContent = englishTitle;
  document.getElementById('result-title-native').textContent = nativeTitle;
  
  // Similarity badge (format score, apply color theme)
  const similarityScore = match.similarity * 100;
  const similarityBadge = document.getElementById('result-similarity');
  similarityBadge.textContent = `${similarityScore.toFixed(1)}% Match`;
  
  // Style similarity badge by threshold
  similarityBadge.className = 'badge-similarity'; // reset class list
  if (similarityScore >= 90) {
    similarityBadge.style.borderColor = 'var(--color-success)';
    similarityBadge.style.color = 'var(--color-success)';
    similarityBadge.style.background = 'rgba(16, 185, 129, 0.15)';
  } else if (similarityScore >= 80) {
    similarityBadge.style.borderColor = 'var(--color-warning)';
    similarityBadge.style.color = 'var(--color-warning)';
    similarityBadge.style.background = 'rgba(245, 158, 11, 0.15)';
  } else {
    similarityBadge.style.borderColor = 'var(--color-error)';
    similarityBadge.style.color = 'var(--color-error)';
    similarityBadge.style.background = 'rgba(239, 68, 68, 0.15)';
  }
  
  // Low confidence warning check
  const lowConfidenceAlert = document.getElementById('low-confidence-alert');
  const alertSimilarityVal = document.getElementById('alert-similarity-val');
  if (similarityScore < 85) {
    alertSimilarityVal.textContent = `${similarityScore.toFixed(1)}%`;
    lowConfidenceAlert.classList.remove('hidden');
  } else {
    lowConfidenceAlert.classList.add('hidden');
  }
  
  // Episode badge
  const episodeBadge = document.getElementById('result-episode');
  if (match.episode) {
    episodeBadge.textContent = `Episode ${Array.isArray(match.episode) ? match.episode.join('-') : match.episode}`;
    episodeBadge.classList.remove('hidden');
  } else {
    episodeBadge.classList.add('hidden');
  }
  
  // Timestamp badge
  const timeSec = match.at;
  const minutes = Math.floor(timeSec / 60);
  const seconds = Math.floor(timeSec % 60);
  const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  document.getElementById('result-timestamp').textContent = formattedTime;
  
  // Video visual proof
  const videoElem = document.getElementById('result-video');
  videoElem.src = match.video || '';
  videoElem.load();
  videoElem.play().catch(e => console.log("Video autoplay prevented. Autoplay logic requires mute: true."));
  
  // Mute volume button setup
  const muteBtn = document.getElementById('video-mute-btn');
  const muteIconMuted = document.getElementById('mute-icon-muted');
  const muteIconPlaying = document.getElementById('mute-icon-playing');
  
  // Ensure video starts muted to fulfill browser autoplay rules
  videoElem.muted = true;
  muteIconMuted.classList.remove('hidden');
  muteIconPlaying.classList.add('hidden');
  
  // Handle mute toggle
  // Remove old listeners to prevent stacking
  const newMuteBtn = muteBtn.cloneNode(true);
  muteBtn.parentNode.replaceChild(newMuteBtn, muteBtn);
  
  newMuteBtn.addEventListener('click', () => {
    videoElem.muted = !videoElem.muted;
    const isMuted = videoElem.muted;
    
    const activeMutedIcon = newMuteBtn.querySelector('#mute-icon-muted');
    const activePlayingIcon = newMuteBtn.querySelector('#mute-icon-playing');
    
    if (isMuted) {
      activeMutedIcon.classList.remove('hidden');
      activePlayingIcon.classList.add('hidden');
    } else {
      activeMutedIcon.classList.add('hidden');
      activePlayingIcon.classList.remove('hidden');
    }
  });

  // Banner details
  const bannerImg = document.getElementById('result-banner');
  if (animeInfo?.bannerImage) {
    bannerImg.src = animeInfo.bannerImage;
    bannerImg.style.display = 'block';
  } else if (animeInfo?.coverImage?.extraLarge || animeInfo?.coverImage?.large) {
    bannerImg.src = animeInfo.coverImage.extraLarge || animeInfo.coverImage.large;
    bannerImg.style.display = 'block';
  } else {
    bannerImg.style.display = 'none';
  }
  
  // Details card mapping
  document.getElementById('meta-studio').textContent = animeInfo?.studios?.nodes?.[0]?.name || '-';
  document.getElementById('meta-season').textContent = animeInfo?.season && animeInfo?.seasonYear 
    ? `${animeInfo.season} ${animeInfo.seasonYear}` 
    : '-';
  document.getElementById('meta-format').textContent = animeInfo?.format || '-';
  
  // Genres
  const genresBox = document.getElementById('meta-genres');
  genresBox.innerHTML = '';
  if (animeInfo?.genres) {
    animeInfo.genres.forEach(genre => {
      const pill = document.createElement('span');
      pill.className = 'genre-pill';
      pill.textContent = genre;
      genresBox.appendChild(pill);
    });
  }
  
  // Synopsis clean up (remove HTML tags returned by AniList like <br>)
  const rawSynopsis = animeInfo?.description || 'No description synopsis available.';
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = rawSynopsis;
  document.getElementById('meta-synopsis').textContent = tempDiv.textContent || tempDiv.innerText || '';
  
  // External Links
  const linkAnilist = document.getElementById('link-anilist');
  const linkMal = document.getElementById('link-mal');
  
  linkAnilist.href = `https://anilist.co/anime/${match.anilist}`;
  
  if (animeInfo?.idMal) {
    linkMal.href = `https://myanimelist.net/anime/${animeInfo.idMal}`;
    linkMal.classList.remove('hidden');
  } else {
    linkMal.classList.add('hidden');
  }
}

function renderAlternativeMatches(results) {
  const listContainer = document.getElementById('secondary-matches-list');
  listContainer.innerHTML = '';
  
  // Skip index 0 since it is the main result. Show next 4 matches.
  const secondaryMatches = results.slice(1, 5);
  const card = document.getElementById('secondary-matches-card');
  
  if (secondaryMatches.length === 0) {
    card.classList.add('hidden');
    return;
  }
  card.classList.remove('hidden');
  
  secondaryMatches.forEach((match, idx) => {
    const row = document.createElement('div');
    row.className = 'secondary-match-row';
    
    const similarityScore = match.similarity * 100;
    
    // Similarity class based on confidence threshold
    let simClass = 'low';
    if (similarityScore >= 90) simClass = 'high';
    else if (similarityScore >= 80) simClass = 'mid';
    
    // Time formatter
    const timeSec = match.at;
    const min = Math.floor(timeSec / 60);
    const sec = Math.floor(timeSec % 60);
    const timeFormatted = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    
    // Clean up filename for displaying a readable title
    const cleanName = match.filename 
      ? match.filename.replace(/\.[^/.]+$/, "").replace(/^[\[\(].*?[\]\)]\s*/g, "").replace(/_/g, " ") 
      : `Alternative Source #${idx + 1}`;
    
    row.innerHTML = `
      <div class="match-info-left-wrapper">
        <div class="match-thumbnail-container">
          <img src="${match.image}" alt="Preview" class="match-row-thumb">
          <video src="${match.video}" loop muted playsinline class="match-row-video hidden"></video>
          <div class="thumb-hover-overlay">
            <i data-lucide="play" class="play-icon"></i>
          </div>
        </div>
        <div class="match-info-left">
          <div class="match-row-title">${cleanName}</div>
          <div class="match-row-subtitle">Episode ${match.episode || 'N/A'} at timestamp ${timeFormatted}</div>
        </div>
      </div>
      <div class="match-info-right">
        <span class="match-row-similarity ${simClass}">${similarityScore.toFixed(1)}%</span>
        <i data-lucide="chevron-right" style="width:16px; height:16px; opacity:0.5;"></i>
      </div>
    `;
    
    // Interactive hover triggers for mini video previews
    const thumbImg = row.querySelector('.match-row-thumb');
    const thumbVid = row.querySelector('.match-row-video');
    
    row.addEventListener('mouseenter', () => {
      if (thumbVid) {
        thumbImg.classList.add('hidden');
        thumbVid.classList.remove('hidden');
        thumbVid.play().catch(e => {});
      }
    });
    
    row.addEventListener('mouseleave', () => {
      if (thumbVid) {
        thumbVid.pause();
        thumbVid.classList.add('hidden');
        thumbImg.classList.remove('hidden');
      }
    });
    
    // Click listener to toggle this match as main
    row.addEventListener('click', async () => {
      setLoadingState(true, `Loading alternative match details...`, 60);
      const details = await fetchAnimeDetails(match.anilist);
      renderMainResult(match, details);
      setLoadingState(false);
      resultsContent.classList.remove('hidden');
      resultsPanel.scrollIntoView({ behavior: 'smooth' });
    });
    
    listContainer.appendChild(row);
  });
  
  // Re-run lucide icons generator on the dynamically added content
  lucide.createIcons();
}

// --- SauceNAO Fallback Form Submission ---
function searchSauceNAO() {
  if (!currentImageFile) {
    alert("Please load an image first.");
    return;
  }
  
  // SauceNAO expects a File payload, convert Blob if required
  let fileToUpload = currentImageFile;
  if (!(fileToUpload instanceof File)) {
    fileToUpload = new File([currentImageFile], "cropped_panel.jpg", { type: "image/jpeg" });
  }
  
  // Programmatically inject file into hidden form input via DataTransfer API
  try {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(fileToUpload);
    saucenaoFileInput.files = dataTransfer.files;
    
    // Submit form target=_blank
    saucenaoForm.submit();
  } catch (err) {
    console.error("Failed to assign file programmatically:", err);
    alert(
      "Programmatic upload blocked. Please navigate to SauceNAO.com manually and upload the image from your downloads."
    );
  }
}

// --- History Storage & Drawer ---
function toggleHistoryDrawer() {
  historyDrawer.classList.toggle('active');
}

function saveToHistory(match, animeInfo, imageBlob) {
  // Convert blob to DataURL to store thumbnail in localStorage
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    
    const historyItem = {
      id: Date.now(),
      anilistId: match.anilist,
      title: animeInfo?.title?.romaji || match.filename || 'Unknown Anime',
      episode: match.episode || '-',
      timestamp: match.at,
      similarity: match.similarity,
      thumbnail: dataUrl,
      matchData: match,
      animeData: animeInfo
    };
    
    // Add to top of list, limit to 20 items
    searchHistory.unshift(historyItem);
    if (searchHistory.length > 20) {
      searchHistory.pop();
    }
    
    localStorage.setItem('otaku_lens_history', JSON.stringify(searchHistory));
    renderHistory();
  };
  
  reader.readAsDataURL(imageBlob);
}

function loadHistory() {
  const localData = localStorage.getItem('otaku_lens_history');
  if (localData) {
    searchHistory = JSON.parse(localData);
  }
  renderHistory();
}

function renderHistory() {
  // Set badge count
  historyCountBadge.textContent = searchHistory.length;
  
  historyList.innerHTML = '';
  
  if (searchHistory.length === 0) {
    historyList.innerHTML = `
      <div class="history-empty">
        <i data-lucide="history" class="history-empty-icon"></i>
        <p>Your search history is empty</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }
  
  searchHistory.forEach(item => {
    const historyRow = document.createElement('div');
    historyRow.className = 'history-item';
    
    // Time formatter
    const min = Math.floor(item.timestamp / 60);
    const sec = Math.floor(item.timestamp % 60);
    const timeFormatted = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    
    historyRow.innerHTML = `
      <div class="history-thumb-wrapper">
        <img class="history-thumb" src="${item.thumbnail}" alt="Thumbnail">
      </div>
      <div class="history-item-details">
        <div class="history-item-title">${item.title}</div>
        <div class="history-item-meta">
          <span>Ep ${item.episode} @ ${timeFormatted}</span>
          <span class="history-item-similarity">${(item.similarity * 100).toFixed(1)}%</span>
        </div>
      </div>
      <button class="btn-delete-history" title="Remove from History" data-id="${item.id}">
        <i data-lucide="trash-2" style="width:12px; height:12px;"></i>
      </button>
    `;
    
    // Click history row to display search details again
    historyRow.addEventListener('click', (e) => {
      // If delete button clicked, ignore row click
      if (e.target.closest('.btn-delete-history')) return;
      
      loadHistoryItem(item);
    });
    
    // Delete item click
    const delBtn = historyRow.querySelector('.btn-delete-history');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteHistoryItem(item.id);
    });
    
    historyList.appendChild(historyRow);
  });
  
  lucide.createIcons();
}

function loadHistoryItem(item) {
  // Populate upload cropper interface with thumbnail to simulate state
  setupCropper(item.thumbnail);
  
  // Render main result panel
  renderMainResult(item.matchData, item.animeData);
  
  // Set alternatives hidden since they are not fully cached
  document.getElementById('secondary-matches-card').classList.add('hidden');
  
  // Close drawer
  toggleHistoryDrawer();
  
  // Show result content
  resultsEmpty.classList.add('hidden');
  resultsLoading.classList.add('hidden');
  resultsContent.classList.remove('hidden');
  resultsPanel.scrollIntoView({ behavior: 'smooth' });
}

function deleteHistoryItem(id) {
  searchHistory = searchHistory.filter(item => item.id !== id);
  localStorage.setItem('otaku_lens_history', JSON.stringify(searchHistory));
  renderHistory();
}

function clearHistory() {
  if (confirm("Are you sure you want to clear your search history?")) {
    searchHistory = [];
    localStorage.removeItem('otaku_lens_history');
    renderHistory();
  }
}
