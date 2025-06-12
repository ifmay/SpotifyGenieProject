/**
 * Spotify Genie
 */

// Authentication code
const clientId = 'fb6eea506c354ff292e0898ffa737638';
const redirectUrl = 'https://spotifygenie-96268.web.app/';
const authorizationEndpoint = "https://accounts.spotify.com/authorize";
const tokenEndpoint = "https://accounts.spotify.com/api/token";
const scope = 'user-read-private user-read-email user-library-read user-top-read user-read-recently-played playlist-modify-private playlist-read-private';

let lastDisplayedRecommendations = null;

// Token management
const currentToken = {
  get access_token() { return localStorage.getItem('access_token') || null; },
  get refresh_token() { return localStorage.getItem('refresh_token') || null; },
  get expires_in() { return localStorage.getItem('expires_in') || null },
  get expires() { return localStorage.getItem('expires') || null },


  save: function (response) {
    const { access_token, refresh_token, expires_in } = response;
    localStorage.setItem('access_token', access_token);
    localStorage.setItem('refresh_token', refresh_token);
    localStorage.setItem('expires_in', expires_in);


    const now = new Date();
    const expiry = new Date(now.getTime() + (expires_in * 1000));
    localStorage.setItem('expires', expiry);
  }
};

// Get code from URL
const args = new URLSearchParams(window.location.search);
const code = args.get('code');

// Add this function to automatically load a default dataset
async function loadDefaultDataset() {
  console.log("Attempting to load default dataset...");
  updateLoadingMessage("Loading music dataset...");
  
  try {
    // Initialize recommendation engine if not already done
    if (!window.recommendationEngine) {
      window.recommendationEngine = new window.RecommendationEngine();
      console.log("Created new recommendation engine instance");
    }
    
    updateLoadingMessage("Finding your new favorite songs...");
    
    // URL to your hosted dataset - this should be a relative path to where you host the CSV
    const datasetUrl = 'spotify_tracks.csv';
    
    // Fetch the dataset file
    const response = await fetch(datasetUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch dataset: ${response.status} ${response.statusText}`);
    }
    
    const csvContent = await response.text();
    console.log("Dataset fetched successfully, first 100 chars:", csvContent.substring(0, 100));
    
    updateLoadingMessage("Processing music data...");
    
    // Parse the CSV content
    Papa.parse(csvContent, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        console.log("Dataset parsed successfully:", {
          rowCount: results.data.length,
          fields: results.meta.fields
        });
        
        updateLoadingMessage("Finishing up...");
        
        // Store the dataset in the recommendation engine
        window.recommendationEngine.dataset = results.data;
        
        try {
          // Preprocess the data
          window.recommendationEngine.preprocessData();
          console.log("Dataset preprocessing completed successfully");
          
          // Update the UI to reflect that dataset is loaded
          const datasetStatus = document.getElementById('dataset-status');
          if (datasetStatus) {
            datasetStatus.textContent = 
              `Default dataset loaded: ${window.recommendationEngine.dataset.length} songs`;
            datasetStatus.classList.add('preloaded');
          }
          
          // Enable mood buttons if liked songs are also loaded
          if (window.recommendationEngine.likedSongs) {
            document.getElementById('generate-recommendations-btn').disabled = false;
            updateMoodButtonStates();
          }
          
          updateLoadingMessage("");
        } catch (preprocessError) {
          console.error("Error during preprocessing:", preprocessError);
          updateLoadingMessage("Error preprocessing music data.");
        }
      },
      error: (error) => {
        console.error("Error parsing dataset CSV:", error);
        updateLoadingMessage("Error loading music data.");
      }
    });
  } catch (error) {
    console.error("Error loading default dataset:", error);
    updateLoadingMessage("Failed to load music dataset.");
  }
}

async function autoLoadLikedSongs() {
  console.log("Attempting to auto-load liked songs from Spotify...");
  
  // Check if we're logged in
  if (!currentToken.access_token) {
    console.log("User not logged in, can't auto-load liked songs");
    return false;
  }
  
  try {
    // Check if the recommendation engine exists
    if (!window.recommendationEngine) {
      console.log("Creating recommendation engine instance");
      window.recommendationEngine = new window.RecommendationEngine();
    }
    
    // Get user's saved tracks from Spotify
    const allTracks = await getUserSavedTracks(50);
    console.log(`Retrieved ${allTracks.length} tracks from Spotify API for auto-loading`);
    
    if (allTracks.length === 0) {
      console.log("No liked songs found in user's Spotify library");
      return false;
    }

    // Randomly select 10-20 tracks for better recommendation variety
    const selectedCount = Math.min(10, allTracks.length);
    const tracks = allTracks.sort(() => 0.5 - Math.random()).slice(0, selectedCount);
    console.log(`Selected ${tracks.length} random tracks for recommendation engine`);
    
    // Format tracks to match liked songs format (Name, Artist)
    const formattedTracks = tracks.map(track => ({
      Name: track.name,
      Artist: track.artist
    }));
    
    // Set the liked songs directly
    window.recommendationEngine.likedSongs = formattedTracks;
    
    // Update UI if the status element exists
    const likedSongsStatus = document.getElementById('liked-songs-status');
    if (likedSongsStatus) {
      likedSongsStatus.textContent = 
        `Auto-loaded ${formattedTracks.length} of your Spotify liked songs`;
      likedSongsStatus.classList.add('auto-loaded');
    }
    
    // Enable recommendations button if dataset is also loaded
    if (window.recommendationEngine.dataset) {
      const generateBtn = document.getElementById('generate-recommendations-btn');
      if (generateBtn) {
        generateBtn.disabled = false;
      }
      
      // Also enable mood buttons
      updateMoodButtonStates();
    }
    
    return true;
  } catch (error) {
    console.error("Error auto-loading liked songs:", error);
    return false;
  }
}

// MAIN APP INITIALIZATION
async function initApp() {
  addLoadingMessageStyles();
  console.log("==== APP INITIALIZATION STARTED ====");

  // Show loading overlay immediately
  showLoadingOverlay("Starting Spotify Genie...");

  await loadDefaultDataset();
 
  // Handle auth callback
  if (code) {
    console.log("Code found in URL, exchanging for token");
    try {
      const token = await getToken(code);
      currentToken.save(token);
      console.log("Token obtained and saved");
     
      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete("code");
      const updatedUrl = url.search ? url.href : url.href.replace('?', '');
      window.history.replaceState({}, document.title, updatedUrl);
    } catch (error) {
      console.error("Error during token exchange:", error);
    }
  }

  // Check if we're logged in
  if (currentToken.access_token) {
    try {
      // Render user profile
      const userData = await getUserData();
      console.log("User data fetched successfully:", userData);

      // Create containers
      createContainers();
      
      // Render search form
      renderTemplate("search-form-container", "search-form-template");
            
      // Render CSV recommendations container
      renderTemplate("main", "csv-recommendations-container-template");
      
      // Auto-load liked songs for recommendations
      await autoLoadLikedSongs();
      
      // Fetch and render saved tracks with better error handling
      console.log("Fetching saved tracks...");
      try {
        const tracks = await getUserSavedTracks();
        console.log(`Successfully fetched ${tracks.length} saved tracks`);
        
        // Make sure the tracks container exists
        if (!document.getElementById("tracks-container")) {
          console.warn("tracks-container not found, creating it");
          createContainers();
        }
        
        // Render tracks
        renderTracksTemplate("tracks-container", tracks);
        
        // Hide loading overlay when everything is loaded
        hideLoadingOverlay();
      } catch (error) {
        console.error("Error fetching saved tracks:", error);
        
        // Hide loading overlay even on error
        hideLoadingOverlay();
        
        if (document.getElementById("tracks-container")) {
          document.getElementById("tracks-container").innerHTML = `
            <div class="component-container">
              <h3>Your Saved Tracks</h3>
              <div class="error-message">Error loading tracks: ${error.message}</div>
              <button onclick="location.reload()">Retry</button>
            </div>`;
        }
      }
    } catch (error) {
      console.error("Error initializing logged-in state:", error);
      
      // Hide loading overlay on error
      hideLoadingOverlay();
      
      // Check if it's a token expired error
      if (error.message && error.message.includes("token expired")) {
        console.log("Clearing expired token and redirecting to login");
        localStorage.clear();
        renderTemplate("main", "login");
      }
    }
  } else {
    console.log("No access token found, rendering login template");
    renderTemplate("main", "login");
    
    // Hide loading overlay for login screen
    hideLoadingOverlay();
  }
 
  console.log("==== APP INITIALIZATION COMPLETED ====");
}

// createContainers function to log more information
function createContainers() {
  const containers = [
    "search-form-container",
    "playlist-generator-container",
    "tracks-container"
  ];
 
  containers.forEach(id => {
    const existingContainer = document.getElementById(id);
    if (!existingContainer) {
      console.log(`Creating missing container: ${id}`);
      const container = document.createElement("div");
      container.id = id;
      container.className = "component-container";
      
      // Find where to append the container
      const main = document.getElementById("main");
      if (main) {
        main.appendChild(container);
        console.log(`Added ${id} to main element`);
      } else {
        document.body.appendChild(container);
        console.log(`Added ${id} to body (main element not found)`);
      }
    } else {
      console.log(`Container already exists: ${id}`);
    }
  });
}

// Updated handleSearch with better debugging and error handling
async function handleSearch(event) {
  event.preventDefault();
  const searchInput = document.getElementById('search-input');
 
  if (!searchInput) {
    console.error("Search input element not found");
    return;
  }
 
  const query = searchInput.value.trim();
  console.log(`Executing search for: "${query}"`);
 
  if (!query) {
    console.log("Empty search query, not sending request");
    document.getElementById("search-results").innerHTML = 
      '<div class="info-message">Please enter a search term</div>';
    return;
  }
  
  try {
    // Show loading indicator
    document.getElementById("search-results").innerHTML = 
      '<div class="loading-message">Searching...</div>';
    
    const searchResults = await searchSpotify(query);
    console.log(`Search returned ${searchResults.length} results`);
    
    // Render search results
    renderSearchResultsTemplate("search-results", { searchResults });
  } catch (error) {
    console.error("Search error:", error);
    document.getElementById("search-results").innerHTML =
      `<div class="error-message">Search error: ${error.message}</div>`;
  }
}

function exportLikedSongsToCSV() {
  getUserSavedTracks(50).then(tracks => {
      if (!tracks || tracks.length === 0) {
          alert("No liked songs found!");
          return;
      }

      let csvContent = "data:text/csv;charset=utf-8,Name,Artist\n";
      tracks.forEach(track => {
          let row = `"${track.name}","${track.artist}"`;
          csvContent += row + "\n";
      });

      // Create and trigger download
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", "liked_songs.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  }).catch(error => {
      console.error("Error exporting liked songs:", error);
      alert("Failed to export liked songs.");
  });
}

// SPOTIFY API FUNCTIONS
// Auth flow
async function redirectToSpotifyAuthorize() {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const randomValues = crypto.getRandomValues(new Uint8Array(64));
  const randomString = randomValues.reduce((acc, x) => acc + possible[x % possible.length], "");


  const code_verifier = randomString;
  const data = new TextEncoder().encode(code_verifier);
  const hashed = await crypto.subtle.digest('SHA-256', data);


  const code_challenge_base64 = btoa(String.fromCharCode(...new Uint8Array(hashed)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');


  window.localStorage.setItem('code_verifier', code_verifier);


  const authUrl = new URL(authorizationEndpoint)
  const params = {
    response_type: 'code',
    client_id: clientId,
    scope: scope,
    code_challenge_method: 'S256',
    code_challenge: code_challenge_base64,
    redirect_uri: redirectUrl,
  };


  authUrl.search = new URLSearchParams(params).toString();
  window.location.href = authUrl.toString();
}

async function getToken(code) {
  const code_verifier = localStorage.getItem('code_verifier');
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUrl,
      code_verifier: code_verifier,
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(`Token error: ${data.error_description || data.error}`);
  }
  return data;
}

async function refreshToken() {
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: currentToken.refresh_token
    }),
  });
  return await response.json();
}


// Data fetching
async function getUserData() {
  const response = await fetch("https://api.spotify.com/v1/me", {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + currentToken.access_token },
  });


  const data = await response.json();
  if (data.error) {
    throw new Error(`API error: ${data.error.message || 'Unknown error'}`);
  }
  return data;
}

async function getUserSavedTracks(limit =10) {
  try {
    console.log(`Fetching up to ${limit} saved tracks...`);
    const response = await fetch(`https://api.spotify.com/v1/me/tracks?limit=${limit}`, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + currentToken.access_token },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API error: ${errorData.error ? errorData.error.message : response.statusText}`);
    }

    const data = await response.json();
    console.log("Saved tracks API response:", data);
    
    // Validate the response structure
    if (!data.items || !Array.isArray(data.items)) {
      console.error("Unexpected API response format:", data);
      throw new Error("Unexpected API response format");
    }
    
    // Map the response to a simplified format
    const tracks = data.items.map(item => ({
      name: item.track.name,
      artist: item.track.artists.map(a => a.name).join(', '),
      id: item.track.id,
      albumCover: item.track.album.images[0]?.url || ''
    }));
    
    console.log(`Successfully processed ${tracks.length} tracks`);
    return tracks;
  } catch (error) {
    console.error("Error in getUserSavedTracks:", error);
    throw error; // Re-throw to be caught by the caller
  }
}

async function searchSpotify(query, type = 'track', limit = 10) {
  if (!query) return [];

  try {
    console.log(`Searching for "${query}" (type: ${type}, limit: ${limit})`);
    const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=${type}&limit=${limit}`, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + currentToken.access_token },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Search error: ${errorData.error ? errorData.error.message : response.statusText}`);
    }
    
    const data = await response.json();
    console.log("Search API response:", data);
    
    if (!data.tracks || !data.tracks.items) {
      console.error("Unexpected search response format:", data);
      return [];
    }
    
    // Map the response to a simplified format
    const tracks = data.tracks.items.map(item => ({
      name: item.name,
      artist: item.artists.map(a => a.name).join(', '),
      id: item.id,
      albumCover: item.album.images[0]?.url || '',
      uri: item.uri
    }));
    
    console.log(`Search returned ${tracks.length} results`);
    return tracks;
  } catch (error) {
    console.error("Error in searchSpotify:", error);
    throw error;
  }
}

function renderTracksTemplate(targetId, tracks) {
  console.log(`Rendering ${tracks.length} tracks to ${targetId}`);
  const targetElement = document.getElementById(targetId);
  
  if (!targetElement) {
    console.error(`Target element not found: ${targetId}`);
    return;
  }
  
  // Create container
  const container = document.createElement('div');
  container.className = 'component-container';
  
  // Add heading
  const heading = document.createElement('h3');
  heading.textContent = 'Your Saved Tracks';
  container.appendChild(heading);
  
  // Always add the export button at the top
  
  if (!tracks || tracks.length === 0) {
    const noTracksMsg = document.createElement('p');
    noTracksMsg.textContent = "You don't have any saved tracks yet.";
    container.appendChild(noTracksMsg);
  } else {
    // Create tracks list
    const tracksList = document.createElement('div');
    tracksList.className = 'track-list';
    
    tracks.forEach(track => {
      const trackItem = document.createElement('div');
      trackItem.className = 'track-item';
      
      // Create track info container first (this will be on the left)
      const trackInfo = document.createElement('div');
      trackInfo.className = 'track-info';
      
      // Add track name
      const trackName = document.createElement('div');
      trackName.className = 'track-name';
      trackName.textContent = track.name;
      trackInfo.appendChild(trackName);
      
      // Add artist name
      const artistName = document.createElement('div');
      artistName.className = 'track-artist';
      artistName.textContent = track.artist;
      trackInfo.appendChild(artistName);
      
      // Add the track info to the track item (on the left)
      trackItem.appendChild(trackInfo);
      
      // Create album cover if available (this will be on the right)
      if (track.albumCover) {
        const albumImg = document.createElement('img');
        albumImg.src = track.albumCover;
        albumImg.alt = `${track.name} album art`;
        albumImg.className = 'album-cover';
        trackItem.appendChild(albumImg);
      }
      
      tracksList.appendChild(trackItem);
    });
    
    container.appendChild(tracksList);
  }
  
  // Clear and append to target
  targetElement.innerHTML = '';
  targetElement.appendChild(container);
}

// Get saved tracks with audio features
async function getSavedTracksWithFeatures() {
  console.log("Fetching saved tracks with audio features");
  
  // Step 1: Get saved tracks
  const savedTracksResponse = await fetch('https://api.spotify.com/v1/me/tracks?limit=50', {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + currentToken.access_token },
  });
  
  if (!savedTracksResponse.ok) {
    throw new Error(`Failed to fetch saved tracks: ${savedTracksResponse.status}`);
  }
  
  const savedTracksData = await savedTracksResponse.json();
  
  if (!savedTracksData.items || savedTracksData.items.length === 0) {
    return [];
  }
  
  // Step 2: Get track IDs and prepare for audio features request
  const trackIds = savedTracksData.items.map(item => item.track.id);
  
  // Step 3: Get audio features in batches (Spotify API limit is 100 per request)
  const tracksWithFeatures = await getAudioFeatures(trackIds, savedTracksData.items);
  
  return tracksWithFeatures;
}

function processTracksForPlaylist(trackItems, playlistType) {
  console.log(`Processing ${trackItems.length} tracks for ${playlistType} playlist`);
  
  // Map tracks to a common format with audio features if available
  const tracks = trackItems.map(item => {
    // Handle both saved tracks format and top tracks format
    const track = item.track || item;
    
    return {
      id: track.id,
      name: track.name,
      artist: track.artists ? track.artists.map(a => a.name).join(', ') : (track.artist || 'Unknown'),
      albumCover: track.album && track.album.images && track.album.images.length > 0 
        ? track.album.images[0].url 
        : (track.albumCover || ''),
      popularity: track.popularity || 50,
      // Audio features if available
      danceability: track.danceability,
      energy: track.energy,
      acousticness: track.acousticness,
      valence: track.valence,
      tempo: track.tempo,
      // Album info
      album: track.album ? {
        name: track.album.name,
        release_date: track.album.release_date || '2020'
      } : null
    };
  });
  
  // Handle different playlist types using our new functions
  switch (playlistType) {
    case 'mood-happy':
      return getMoodPlaylist(tracks, 'happy');
    
    case 'mood-sad':
      return getMoodPlaylist(tracks, 'sad');
    
    case 'mood-chill':
      return getMoodPlaylist(tracks, 'chill');
    
    case 'mood-hype':
      return getMoodPlaylist(tracks, 'hype');
    
    case 'throwback':
      return getThrowbackPlaylist(tracks);
    
    case 'past-favorites':
      return getPastFavoritesPlaylist(tracks);
    
    case 'new-releases':
      return getNewReleasesPlaylist(tracks);
    
    case 'genre-explorer':
      return getGenreExplorerPlaylist(tracks);
    
    default:
      // If playlist type is not recognized, default to happy mood
      console.log(`Playlist type "${playlistType}" not recognized, defaulting to happy mood`);
      return getMoodPlaylist(tracks, 'happy');
  }
}

// Function to get a readable name from playlist type
function getPlaylistDisplayName(type) {
  const typeMap = {
    'mood': 'Happy',
    'mood-happy': 'Happy',
    'mood-sad': 'Sad',
    'mood-chill': 'Chill',
    'mood-hype': 'Hype',
    'throwback': 'Throwback',
  };
  
  return typeMap[type] || type.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Function to handle the "Save to Spotify" button click
async function handleSaveToSpotify() {
  if (!lastGeneratedPlaylist || !lastGeneratedPlaylist.tracks || lastGeneratedPlaylist.tracks.length === 0) {
    alert("Please generate a playlist first before saving to Spotify.");
    return;
  }
  
  try {
    // Show loading indicator
    const saveButton = document.querySelector('.save-spotify-btn');
    if (saveButton) {
      saveButton.textContent = "Saving...";
      saveButton.disabled = true;
    }
    
    // Format playlist name based on type
    const displayName = getPlaylistDisplayName(lastGeneratedPlaylist.type);
    const playlistName = `${displayName} Playlist by Spotify Genie`;
    
    // Format track URIs - we need to convert IDs to full Spotify URIs
    const trackUris = lastGeneratedPlaylist.tracks.map(track => `spotify:track:${track.id}`);
    
    // Save the playlist
    const result = await savePlaylistToSpotify(playlistName, trackUris);
    
    // Update UI based on result
    if (result.success) {
      // Create success message with link
      const playlistResultsDiv = document.getElementById('playlist-results');
      const successMessage = document.createElement('div');
      successMessage.className = 'success-message';
      successMessage.innerHTML = `
        <p>Playlist "${result.playlistName}" saved successfully!</p>
        <a href="${result.playlistUrl}" target="_blank" class="spotify-button">
          <i class="fab fa-spotify"></i> Open in Spotify
        </a>
      `;
      
      // Insert after the track list
      const trackList = playlistResultsDiv.querySelector('.track-list');
      if (trackList) {
        trackList.after(successMessage);
      } else {
        playlistResultsDiv.appendChild(successMessage);
      }
      
      // Update button
      if (saveButton) {
        saveButton.textContent = "Saved to Spotify ✓";
        saveButton.disabled = true;
      }
    } else {
      // Show error
      alert(`Failed to save playlist: ${result.error}`);
      
      // Reset button
      if (saveButton) {
        saveButton.textContent = "Save to Spotify";
        saveButton.disabled = false;
      }
    }
  } catch (error) {
    console.error("Error in handleSaveToSpotify:", error);
    alert(`Error saving playlist: ${error.message}`);
    
    // Reset button
    const saveButton = document.querySelector('.save-spotify-btn');
    if (saveButton) {
      saveButton.textContent = "Save to Spotify";
      saveButton.disabled = false;
    }
  }
}

// Function to save the generated playlist to Spotify
async function savePlaylistToSpotify(playlistName, trackUris) {
  try {
    console.log(`Saving playlist "${playlistName}" with ${trackUris.length} tracks to Spotify`);
    
    // Step 1: Create a new playlist
    const userResponse = await fetch('https://api.spotify.com/v1/me', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + currentToken.access_token }
    });
    
    if (!userResponse.ok) {
      throw new Error(`Failed to get user profile: ${userResponse.status}`);
    }
    
    const userData = await userResponse.json();
    const userId = userData.id;
    
    console.log(`Creating playlist for user: ${userId}`);
    
    const createResponse = await fetch(`https://api.spotify.com/v1/users/${userId}/playlists`, {
      method: 'POST',
      headers: { 
        'Authorization': 'Bearer ' + currentToken.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: playlistName,
        description: `Generated by Spotify Genie on ${new Date().toLocaleDateString()}`,
        public: false
      })
    });
    
    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Failed to create playlist: ${createResponse.status} - ${errorText}`);
    }
    
    const playlistData = await createResponse.json();
    const playlistId = playlistData.id;
    
    console.log(`Playlist created with ID: ${playlistId}`);
    
    // Step 2: Add tracks to the playlist
    const addTracksResponse = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      method: 'POST',
      headers: { 
        'Authorization': 'Bearer ' + currentToken.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        uris: trackUris
      })
    });
    
    if (!addTracksResponse.ok) {
      const errorText = await addTracksResponse.text();
      throw new Error(`Failed to add tracks to playlist: ${addTracksResponse.status} - ${errorText}`);
    }
    
    const addTracksData = await addTracksResponse.json();
    console.log(`Successfully added ${addTracksData.snapshot_id ? 'tracks to' : 'no tracks to'} playlist`);
    
    return {
      success: true,
      playlistId: playlistId,
      playlistUrl: playlistData.external_urls.spotify,
      playlistName: playlistName
    };
    
  } catch (error) {
    console.error("Error saving playlist to Spotify:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

let lastGeneratedPlaylist = null;

// Function to handle the "Save to Spotify" button click
async function handleSaveToSpotify() {
  if (!lastGeneratedPlaylist || !lastGeneratedPlaylist.tracks || lastGeneratedPlaylist.tracks.length === 0) {
    alert("Please generate a playlist first before saving to Spotify.");
    return;
  }
  
  try {
    // Show loading indicator
    const saveButton = document.querySelector('.save-spotify-btn');
    if (saveButton) {
      saveButton.textContent = "Saving...";
      saveButton.disabled = true;
    }
    
    // Format playlist name based on type
    const playlistName = `${lastGeneratedPlaylist.type.charAt(0).toUpperCase() + lastGeneratedPlaylist.type.slice(1)} Playlist by Spotify Genie`;
    
    // Format track URIs - we need to convert IDs to full Spotify URIs
    const trackUris = lastGeneratedPlaylist.tracks.map(track => `spotify:track:${track.id}`);
    
    // Save the playlist
    const result = await savePlaylistToSpotify(playlistName, trackUris);
    
    // Update UI based on result
    if (result.success) {
      // Create success message with link
      const playlistResultsDiv = document.getElementById('playlist-results');
      const successMessage = document.createElement('div');
      successMessage.className = 'success-message';
      successMessage.innerHTML = `
        <p>Playlist "${result.playlistName}" saved successfully!</p>
        <a href="${result.playlistUrl}" target="_blank" class="spotify-button">
          <i class="fab fa-spotify" style="color: green;"></i> Open in Spotify
        </a>
      `;
      
      // Insert after the track list
      const trackList = playlistResultsDiv.querySelector('.track-list');
      if (trackList) {
        trackList.after(successMessage);
      } else {
        playlistResultsDiv.appendChild(successMessage);
      }
      
      // Update button
      if (saveButton) {
        saveButton.textContent = "Saved to Spotify ✓";
        saveButton.disabled = true;
      }
    } else {
      // Show error
      alert(`Failed to save playlist: ${result.error}`);
      
      // Reset button
      if (saveButton) {
        saveButton.textContent = "Save to Spotify";
        saveButton.disabled = false;
      }
    }
  } catch (error) {
    console.error("Error in handleSaveToSpotify:", error);
    alert(`Error saving playlist: ${error.message}`);
    
    // Reset button
    const saveButton = document.querySelector('.save-spotify-btn');
    if (saveButton) {
      saveButton.textContent = "Save to Spotify";
      saveButton.disabled = false;
    }
  }
}

async function handleGeneratePlaylist(event) {
  event.preventDefault();
  const selectedType = document.querySelector('input[name="playlist-type"]:checked');
 
  if (!selectedType) {
    console.error("No playlist type selected");
    document.getElementById("playlist-results").innerHTML = 
      '<div class="error-message">Please select a playlist type</div>';
    return;
  }
 
  const playlistType = selectedType.value;
  console.log(`Generating playlist of type: ${playlistType}`);
 
  try {
    // Show loading indicator
    const submitButton = document.querySelector('#playlist-form button[type="submit"]');
    if (submitButton) {
      submitButton.textContent = "Generating...";
      submitButton.disabled = true;
    }
    
    document.getElementById("playlist-results").innerHTML = 
      '<div class="loading-message">Generating your perfect playlist...</div>';
    
    // Get user's saved tracks for processing
    console.log("Fetching tracks for playlist generation...");
    const savedTracksResponse = await fetch('https://api.spotify.com/v1/me/tracks?limit=50', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + currentToken.access_token },
    });
    
    if (!savedTracksResponse.ok) {
      throw new Error(`Failed to fetch tracks: ${savedTracksResponse.status}`);
    }
    
    const savedTracksData = await savedTracksResponse.json();
    
    if (!savedTracksData.items || savedTracksData.items.length === 0) {
      throw new Error("No tracks found in your library");
    }
    
    // Format the tracks for processing
    const formattedTracks = savedTracksData.items.map(item => {
      const track = item.track;
      return {
        id: track.id,
        name: track.name,
        artist: track.artists.map(a => a.name).join(', '),
        artists: track.artists,
        album: track.album,
        popularity: track.popularity || 50,
        albumCover: track.album && track.album.images && track.album.images.length > 0 
          ? track.album.images[0].url 
          : ''
      };
    });
    
    console.log(`Formatted ${formattedTracks.length} tracks for playlist generation:`, formattedTracks[0]);
    
    // Get audio features to improve playlist generation
    const trackIds = formattedTracks.map(track => track.id);
    const tracksWithFeatures = await getAudioFeatures(trackIds, formattedTracks);
    
    console.log(`Got audio features for ${tracksWithFeatures.length} tracks`);
    
    // Generate the playlist
    const playlistTracks = processTracksByType(tracksWithFeatures, playlistType);
    console.log(`Generated playlist with ${playlistTracks.length} tracks:`, playlistTracks);
    
    // Store the generated playlist for potential saving to Spotify
    lastGeneratedPlaylist = {
      type: playlistType,
      tracks: playlistTracks,
      generatedAt: new Date()
    };
    
    // Render the playlist to the UI
    renderPlaylistResultsTemplate("playlist-results", {
      playlistTracks,
      playlistType
    });
    
  } catch (error) {
    console.error("Error generating playlist:", error);
    document.getElementById("playlist-results").innerHTML =
      `<div class="error-message">Error generating playlist: ${error.message}</div>`;
  } finally {
    // Reset button
    const submitButton = document.querySelector('#playlist-form button[type="submit"]');
    if (submitButton) {
      submitButton.textContent = "Generate Playlist";
      submitButton.disabled = false;
    }
  }
}
window.saveToSpotify = handleSaveToSpotify;

// EVENT HANDLERS
async function loginWithSpotifyClick() {
  await redirectToSpotifyAuthorize();
}

async function logoutClick() {
  localStorage.clear();
  window.location.href = redirectUrl;
}

async function handleSearch(event) {
  event.preventDefault();
  const searchInput = document.getElementById('search-input');
 
  if (!searchInput) {
    console.error("Search input element not found");
    return;
  }
 
  const query = searchInput.value.trim();
  console.log(`Executing search for: "${query}"`);
 
  if (!query) {
    console.log("Empty search query, not sending request");
    document.getElementById("search-results").innerHTML = 
      '<div class="info-message">Please enter a search term</div>';
    return;
  }
  
  try {
    // Show loading indicator
    document.getElementById("search-results").innerHTML = 
      '<div class="loading-message">Searching...</div>';
    
    const searchResults = await searchSpotify(query);
    console.log(`Search returned ${searchResults.length} results`);
    
    // Render search results
    renderSearchResultsTemplate("search-results", { searchResults });
  } catch (error) {
    console.error("Search error:", error);
    document.getElementById("search-results").innerHTML =
      `<div class="error-message">Search error: ${error.message}</div>`;
  }
}

// TEMPLATE RENDERING
function renderTemplate(targetId, templateId, data = null) {
  console.log(`Rendering template "${templateId}" to target "${targetId}"`);

  // Get the template
  const template = document.getElementById(templateId);
  if (!template) {
      console.error(`Template not found: ${templateId}`);
      return;
  }

  // Get the target
  const targetElement = document.getElementById(targetId);
  if (!targetElement) {
      console.error(`Target element not found in DOM: "${targetId}"`);
      return; // Exit early if target element is missing
  }

  // Clone the template
  const clone = template.content.cloneNode(true);

  // Process data bindings if data is provided
  if (data) {
      const elements = clone.querySelectorAll("*");
      elements.forEach((ele) => {
          // Data binding logic
          if (ele.dataset && ele.dataset.bind) {
              try {
                  const value = evalInContext(ele.dataset.bind, data);
                  ele.textContent = value;
              } catch (error) {
                  console.error(`Error binding data to element:`, error);
              }
          }
      });
  }

  // Render to target
  targetElement.innerHTML = "";
  targetElement.appendChild(clone);
  console.log(`Template "${templateId}" rendered successfully to "${targetId}"`);
}

// Helper function to evaluate expressions in the context of data
function evalInContext(expr, context) {
  try {
    // Create a function that executes with the data as context
    const evaluator = new Function('data', `with(data) { return ${expr}; }`);
    return evaluator(context);
  } catch (error) {
    console.error(`Error evaluating expression "${expr}":`, error);
    return '';
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);

// Add this function to your code to create and manage the loading overlay
// Updated function for creating and managing the loading overlay
function showLoadingOverlay(message = "Loading Spotify Genie...") {
  // Check if overlay already exists
  if (document.getElementById('loading-overlay')) {
    updateLoadingMessage(message);
    return;
  }
  
  // Create overlay container
  const overlay = document.createElement('div');
  overlay.id = 'loading-overlay';
  overlay.className = 'loading-overlay';
  
  // Create content container
  const content = document.createElement('div');
  content.className = 'loading-content';
  
  // Create loading spinner
  const spinner = document.createElement('div');
  spinner.className = 'loading-spinner';
  
  // Create message element
  const messageElement = document.createElement('p');
  messageElement.id = 'loading-message';
  messageElement.textContent = message;
  
  // Assemble elements
  content.appendChild(spinner);
  content.appendChild(messageElement);
  overlay.appendChild(content);
  document.body.appendChild(overlay);
}

// Updated function to update the loading message with improved animation
function updateLoadingMessage(message) {
  const messageElement = document.getElementById('loading-message');
  if (messageElement) {
    // Add fade-out effect
    messageElement.classList.add('message-fade-out');
    
    // After fade-out completes, update text and fade back in
    setTimeout(() => {
      // Remove any existing dots span
      const existingDots = messageElement.querySelector('.loading-dots');
      if (existingDots) {
        existingDots.remove();
      }
      
      // Set the new message text
      messageElement.textContent = message;
      
      // Add animated dots for ongoing processes
      if (message && !message.endsWith('...') && !message.endsWith('.')) {
        const dotsSpan = document.createElement('span');
        dotsSpan.className = 'loading-dots';
        messageElement.appendChild(dotsSpan);
      }
      
      // Show the message
      messageElement.classList.remove('message-fade-out');
      messageElement.classList.add('message-fade-in');
      
      // Remove the fade-in class after animation completes
      setTimeout(() => {
        messageElement.classList.remove('message-fade-in');
      }, 500);
    }, 300);
  }
}

// Function to hide the loading overlay with a smooth fade-out animation
function hideLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    // Add fade-out class
    overlay.classList.add('fade-out');
    
    // Remove after animation completes
    setTimeout(() => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }, 500); // Match this to your CSS transition time
  }
}

function addLoadingMessageStyles() {
  const styleEl = document.createElement('style');
  styleEl.id = 'loading-message-styles';
  styleEl.textContent = `
    .loading-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.85);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
      opacity: 1;
      transition: opacity 0.5s ease;
    }
    
    .loading-content {
      text-align: center;
      color: white;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    
    .loading-spinner {
      display: inline-block;
      width: 60px;
      height: 60px;
      border: 4px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      border-top-color: #1DB954;
      animation: spin 1s ease-in-out infinite;
      margin-bottom: 20px;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    #loading-message {
      font-size: 20px;
      font-weight: 400;
      color: white;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
      margin: 15px 0;
      padding: 10px;
      max-width: 80%;
      margin: 0 auto;
      text-align: center;
      transition: opacity 0.3s ease, transform 0.3s ease;
    }
    
    .message-fade-out {
      opacity: 0;
      transform: translateY(-10px);
    }
    
    .message-fade-in {
      animation: messageAppear 0.5s ease forwards;
    }
    
    @keyframes messageAppear {
      0% {
        opacity: 0;
        transform: translateY(10px);
      }
      100% {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    /* Add a decorative element below the text */
    #loading-message::after {
      content: '';
      display: block;
      width: 40px;
      height: 3px;
      background: linear-gradient(90deg, #1DB954, #1ED760);
      margin: 15px auto 0;
      border-radius: 3px;
    }
    
    /* Style for dots that appear after the message */
    .loading-dots {
      display: inline-block;
      position: relative;
      width: 30px;
      text-align: left;
    }
    
    .loading-dots::after {
      content: '...';
      position: absolute;
      left: 0;
      animation: loadingDots 1.5s infinite;
      letter-spacing: 2px;
    }
    
    @keyframes loadingDots {
      0%, 20% { content: '.'; }
      40% { content: '..'; }
      60%, 100% { content: '...'; }
    }
    
    /* Center regular loading messages in the app */
    .loading-message {
      display: flex;
      justify-content: center;
      align-items: center;
      text-align: center;
      padding: 20px;
      font-size: 16px;
      color: #1DB954;
      width: 100%;
    }
    
    .loading-message::before {
      content: '';
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid rgba(29, 185, 84, 0.3);
      border-radius: 50%;
      border-top-color: #1DB954;
      animation: spin 1s linear infinite;
      margin-right: 10px;
    }
    
    /* For centered loading state within components */
    p.loading {
      display: flex;
      justify-content: center;
      align-items: center;
      text-align: center;
      padding: 20px;
      font-size: 16px;
      color: #1DB954;
      width: 100%;
    }
    
    p.loading::before {
      content: '';
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid rgba(29, 185, 84, 0.3);
      border-radius: 50%;
      border-top-color: #1DB954;
      animation: spin 1s linear infinite;
      margin-right: 10px;
    }
  `;
  
  document.head.appendChild(styleEl);
}

// Function to hide the loading overlay
function hideLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    // Add fade-out class
    overlay.classList.add('fade-out');
    
    // Remove after animation completes
    setTimeout(() => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }, 500); // Match this to your CSS transition time
  }
}

/**
 * CSV Recommendation Feature
 */
// Global instance of recommendation engine
let recommendationEngine = null;

async function handleDatasetUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    // Show loading indicator
    document.getElementById('dataset-status').textContent = "Loading custom dataset...";
    
    // Read the file content
    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target.result;
      console.log("Dataset file read successfully, first 100 chars:", content.substring(0, 100));
      
      // Initialize recommendation engine if not already done
      if (!window.recommendationEngine) {
        window.recommendationEngine = new window.RecommendationEngine();
      }
      
      try {
        // Parse the CSV content directly
        Papa.parse(content, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results) => {
            console.log("Custom dataset parsed successfully:", {
              rowCount: results.data.length,
              fields: results.meta.fields
            });
            
            // Check if dataset has required columns
            const requiredFields = ['track_name', 'artists'];
            const missingFields = requiredFields.filter(field => 
              !results.meta.fields.includes(field)
            );
            
            if (missingFields.length > 0) {
              console.warn("Dataset missing required fields:", missingFields);
              // Add missing fields with dummy values
              results.data.forEach((row, index) => {
                if (!row.track_name) row.track_name = `Track ${index + 1}`;
                if (!row.artists) row.artists = "Unknown Artist";
              });
            }
            
            // Replace the currently loaded dataset
            window.recommendationEngine.dataset = results.data;
            
            try {
              window.recommendationEngine.preprocessData();
              console.log("Dataset preprocessing completed successfully");
            } catch (preprocessError) {
              console.error("Error during preprocessing:", preprocessError);
            }
            
            document.getElementById('dataset-status').textContent = 
              `Custom dataset loaded: ${window.recommendationEngine.dataset.length} songs`;
            
            // Enable recommendations button if both datasets are loaded
            if (window.recommendationEngine.likedSongs) {
              document.getElementById('generate-recommendations-btn').disabled = false;
              // Update mood button states
              updateMoodButtonStates();
            }
          },
          error: (error) => {
            console.error("Error parsing dataset CSV:", error);
            document.getElementById('dataset-status').textContent = 
              `Error loading dataset: ${error.message}`;
          }
        });
      } catch (error) {
        console.error("Error loading dataset:", error);
        document.getElementById('dataset-status').textContent = 
          `Error loading dataset: ${error.message}`;
      }
    };
    reader.readAsText(file);
  } catch (error) {
    console.error("Error handling dataset upload:", error);
    document.getElementById('dataset-status').textContent = 
      `Error: ${error.message}`;
  }
}

// Function to handle liked songs upload
async function handleLikedSongsUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    // Show loading indicator
    document.getElementById('liked-songs-status').textContent = "Loading liked songs...";
    
    // Read the file content
    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target.result;
      
      // Initialize recommendation engine if not already done
      if (!recommendationEngine) {
        recommendationEngine = new window.RecommendationEngine();
      }
      
      try {
        // Parse the CSV content directly
        Papa.parse(content, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results) => {
            console.log(`Liked songs parsed with ${results.data.length} songs`);
            recommendationEngine.likedSongs = results.data;
            
            document.getElementById('liked-songs-status').textContent = 
              `Liked songs loaded: ${recommendationEngine.likedSongs.length} songs`;
            
            // Enable recommendations button if both datasets are loaded
            if (recommendationEngine.dataset) {
              document.getElementById('generate-recommendations-btn').disabled = false;
            }
          },
          error: (error) => {
            console.error("Error parsing liked songs CSV:", error);
            document.getElementById('liked-songs-status').textContent = 
              `Error loading liked songs: ${error.message}`;
          }
        });
      } catch (error) {
        console.error("Error loading liked songs:", error);
        document.getElementById('liked-songs-status').textContent = 
          `Error loading liked songs: ${error.message}`;
      }
    };
    reader.readAsText(file);
  } catch (error) {
    console.error("Error handling liked songs upload:", error);
    document.getElementById('liked-songs-status').textContent = 
      `Error: ${error.message}`;
  }
}

// Function to use existing Spotify liked songs
async function useSpotifyLikedSongs() {
  try {
    // Show loading indicator
    document.getElementById('liked-songs-status').textContent = "Loading Spotify liked songs...";
    
    // Get user's saved tracks from Spotify
    const allTracks = await getUserSavedTracks(50);
    console.log(`Retrieved ${allTracks.length} tracks from Spotify API:`, allTracks);

    const tracks = allTracks.sort(() => 0.5 - Math.random()).slice(0,10)
    console.log(`Selected ${tracks.length} random tracks for recommendation engine`, tracks);
    
    // Initialize recommendation engine if not already done
    if (!recommendationEngine) {
      recommendationEngine = new window.RecommendationEngine();
    }
    
    // Format tracks to match liked songs format (Name, Artist)
    const formattedTracks = tracks.map(track => ({
      Name: track.name,
      Artist: track.artist
    }));
    
    console.log("Formatted tracks for liked songs:", formattedTracks);
    
    // Set the liked songs directly
    recommendationEngine.likedSongs = formattedTracks;
    
    document.getElementById('liked-songs-status').textContent = 
      `Spotify liked songs loaded: 20 songs`;
    
    // Enable recommendations button if both datasets are loaded
    if (recommendationEngine.dataset) {
      document.getElementById('generate-recommendations-btn').disabled = false;
    }
  } catch (error) {
    console.error("Error loading Spotify liked songs:", error);
    document.getElementById('liked-songs-status').textContent = 
      `Error loading Spotify liked songs: ${error.message}`;
  }
}

// Function to generate recommendations and format songs nicely using the Spotify API
async function generateCSVRecommendations() {
  try {
    // Show loading indicator
    document.getElementById('csv-recommendations-results').innerHTML = 
      '<p class="loading">Generating personalized recommendations...</p>';
    
    // Check if engine exists
    if (!window.recommendationEngine) {
      window.recommendationEngine = new window.RecommendationEngine();
      
      // Since we're creating it now, we need to load dataset
      const datasetStatus = document.getElementById('dataset-status');
      if (datasetStatus) {
        datasetStatus.textContent = "Please wait while we load the dataset...";
      }
      
      // Attempt to reload dataset
      await loadDefaultDataset();
    }
    
    // Clear check for dataset and liked songs with better user guidance
    if (!window.recommendationEngine.dataset) {
      throw new Error("Dataset not loaded. Please refresh the page to load the default dataset.");
    }
    
    if (!window.recommendationEngine.likedSongs) {
      // If user is logged in, try to auto-load liked songs
      if (currentToken.access_token) {
        const loaded = await autoLoadLikedSongs();
        if (!loaded) {
          throw new Error("Could not load your Spotify liked songs. Please use the 'Use Spotify Liked Songs' button in the Liked Songs section.");
        }
      } else {
        throw new Error("Please load your liked songs first using the 'Use Spotify Liked Songs' button or upload a CSV.");
      }
    }
    
    console.log("Starting general recommendation generation with:", {
      datasetSize: window.recommendationEngine.dataset.length,
      likedSongsSize: window.recommendationEngine.likedSongs.length
    });
    
    // Verify dataset has required properties
    const sampleSong = window.recommendationEngine.dataset[0];
    console.log("Sample song from dataset:", sampleSong);
    
    // Make sure required features exist in the dataset
    const requiredFeatures = ['popularity', 'danceability', 'energy', 'acousticness', 'valence', 'tempo'];
    const missingFeatures = requiredFeatures.filter(feature => 
      !sampleSong.hasOwnProperty(feature) && !sampleSong.hasOwnProperty(`${feature}_standardized`)
    );
    
    if (missingFeatures.length > 0) {
      console.warn("Dataset is missing these features:", missingFeatures);
      // If features are missing, add dummy values
      window.recommendationEngine.dataset.forEach(song => {
        missingFeatures.forEach(feature => {
          song[feature] = Math.random() * 0.5 + 0.25; // Random value between 0.25 and 0.75
        });
      });
      // Reprocess data with added features
      window.recommendationEngine.preprocessData();
    }
    
    // Force preprocessing before generating recommendations
    console.log("Preprocessing data...");
    window.recommendationEngine.preprocessData();
    
    // Generate 50 recommendations
    console.log("Calling recommendSongs method to get 50 recommendations...");
    const allRecommendations = window.recommendationEngine.recommendSongs(50);
    console.log(`Generated ${allRecommendations.length} total recommendations`);
    
    if (!allRecommendations || allRecommendations.length === 0) {
      throw new Error("No recommendations were generated. Try using different liked songs.");
    }
    
    // Ensure recommendations have all required properties
    const cleanedRecommendations = allRecommendations.map(rec => ({
      name: rec.name || "Unknown Track",
      artist: rec.artist || "Unknown Artist",
      genre: rec.genre || "Unknown Genre",
      score: typeof rec.score === 'number' ? rec.score.toFixed(2) : rec.score || "N/A",
      id: rec.id || `local-${(rec.name || 'track').replace(/\s+/g, '-').toLowerCase()}`,
      albumCover: rec.albumCover || ''
    }));
    
    // Reset playlist type for general recommendations
    currentPlaylistType = "Personalized";
    
    // Store all recommendations for potential use in playlist creation
    lastCsvRecommendations = cleanedRecommendations;
    console.log(`Stored ${lastCsvRecommendations.length} cleaned recommendations`);
    
    // Randomly select 10 from the recommendations to display
    const displayCount = Math.min(10, cleanedRecommendations.length);
    const shuffledRecommendations = [...cleanedRecommendations].sort(() => Math.random() - 0.5);
    const selectedRecommendations = shuffledRecommendations.slice(0, displayCount);
    
    console.log(`Randomly selected ${selectedRecommendations.length} recommendations to display`);
    
    // Display the recommendations
    renderRecommendationsTemplate("csv-recommendations-results", {
      recommendations: selectedRecommendations,
      playlistType: currentPlaylistType
    });
  } catch (error) {
    console.error("Error generating recommendations:", error);
    
    // Provide more helpful error message to guide users
    let errorMessage = error.message;
    if (error.message.includes("not loaded")) {
      errorMessage += " This may be because the dataset is still loading. Please wait a moment and try again.";
    }
    
    document.getElementById('csv-recommendations-results').innerHTML = 
      `<div class="error-message">Error generating recommendations: ${errorMessage}</div>`;
  }
}

// Function to generate uplifting happy recommendations using sophisticated audio features
async function generateHappyRecommendations() {
  try {
    // Show loading indicator
    document.getElementById('csv-recommendations-results').innerHTML = 
      '<p class="loading">Generating uplifting happy song recommendations...</p>';
    
    // Check if engine exists
    if (!window.recommendationEngine) {
      window.recommendationEngine = new window.RecommendationEngine();
      
      // Since we're creating it now, we need to load dataset
      const datasetStatus = document.getElementById('dataset-status');
      if (datasetStatus) {
        datasetStatus.textContent = "Please wait while we load the dataset...";
      }
      
      // Attempt to reload dataset
      await loadDefaultDataset();
    }
    
    // Clear check for dataset and liked songs with better user guidance
    if (!window.recommendationEngine.dataset) {
      throw new Error("Dataset not loaded. Please refresh the page to load the default dataset.");
    }
    
    if (!window.recommendationEngine.likedSongs) {
      // If user is logged in, try to auto-load liked songs
      if (currentToken.access_token) {
        const loaded = await autoLoadLikedSongs();
        if (!loaded) {
          throw new Error("Could not load your Spotify liked songs. Please use the 'Use Spotify Liked Songs' button in the Liked Songs section.");
        }
      } else {
        throw new Error("Please load your liked songs first using the 'Use Spotify Liked Songs' button or upload a CSV.");
      }
    }
    
    console.log("Starting happy song recommendation generation with:", {
      datasetSize: window.recommendationEngine.dataset.length,
      likedSongsSize: window.recommendationEngine.likedSongs.length
    });
    
    // Get a sample song to check the dataset structure
    const sampleSong = window.recommendationEngine.dataset[0];
    console.log("Sample song from dataset:", sampleSong);
    
    // Make sure required features exist in the dataset
    const requiredFeatures = [
      'popularity', 'danceability', 'energy', 'acousticness', 
      'valence', 'tempo', 'liveness', 'instrumentalness', 'loudness', 'mode', 'key'
    ];
    
    const missingFeatures = requiredFeatures.filter(feature => 
      !sampleSong.hasOwnProperty(feature) && !sampleSong.hasOwnProperty(`${feature}_standardized`)
    );
    
    if (missingFeatures.length > 0) {
      console.warn("Dataset is missing these features:", missingFeatures);
      // If features are missing, add dummy values
      window.recommendationEngine.dataset.forEach(song => {
        missingFeatures.forEach(feature => {
          song[feature] = Math.random() * 0.5 + 0.25; // Random value between 0.25 and 0.75
        });
      });
      // Reprocess data with added features
      window.recommendationEngine.preprocessData();
    }
    
    // Force preprocessing before generating recommendations
    console.log("Preprocessing data...");
    window.recommendationEngine.preprocessData();
    
    // Generate 200 recommendations
    console.log("Calling recommendSongs method to get 200 recommendations...");
    const allRecommendations = window.recommendationEngine.recommendSongs(500);
    console.log(`Generated ${allRecommendations.length} total recommendations`);
    
    if (!allRecommendations || allRecommendations.length === 0) {
      throw new Error("No recommendations were generated. Try using different liked songs.");
    }
    
    // Calculate a comprehensive "happiness score" using multiple attributes
    const recommendationsWithHappinessScore = allRecommendations.map(song => {
      // Get all relevant attributes (or their standardized versions)
      const valence = song.valence || song.valence_standardized || 0.5;
      const energy = song.energy || song.energy_standardized || 0.5;
      const danceability = song.danceability || song.danceability_standardized || 0.5;
      const tempo = song.tempo || song.tempo_standardized || 120;
      const mode = song.mode || song.mode_standardized || 0; // Major (1) tends to sound happier than minor (0)
      const acousticness = song.acousticness || song.acousticness_standardized || 0.5;
      const liveness = song.liveness || song.liveness_standardized || 0.5;
      const loudness = song.loudness || song.loudness_standardized || -10;
      const popularity = song.popularity || song.popularity_standardized || 50;
      
      // Normalize tempo to a 0-1 scale (assuming typical range of 40-200 BPM)
      // For happy music, we prefer moderate to upbeat tempo (not too slow, not too fast)
      // Peak happiness around 120-140 BPM
      let normalizedTempo = 0;
      if (tempo >= 40 && tempo <= 200) {
        if (tempo >= 110 && tempo <= 150) {
          // Peak happiness range
          normalizedTempo = 1.0;
        } else if (tempo < 110) {
          // Scale up from 40 to 110
          normalizedTempo = (tempo - 40) / 70;
        } else {
          // Scale down from 150 to 200
          normalizedTempo = 1 - ((tempo - 150) / 50);
        }
      }
      normalizedTempo = Math.max(0, Math.min(1, normalizedTempo));
      
      // Normalize loudness (typically ranges from -60 to 0 dB)
      // For happy music, medium to higher loudness is preferable (-15 to -5 dB is ideal)
      let normalizedLoudness = 0;
      if (loudness >= -60 && loudness <= 0) {
        if (loudness >= -15 && loudness <= -5) {
          // Ideal loudness range
          normalizedLoudness = 1.0;
        } else if (loudness < -15) {
          // Scale up from -60 to -15
          normalizedLoudness = (loudness + 60) / 45;
        } else {
          // Scale down from -5 to 0
          normalizedLoudness = 1 - ((loudness + 5) / 5);
        }
      }
      normalizedLoudness = Math.max(0, Math.min(1, normalizedLoudness));
      
      // Normalize mode (0 or 1) to favor major keys
      const normalizedMode = mode === 1 ? 1 : 0.4; // Major mode gets full score, minor gets partial
      
      // Normalize popularity to 0-1 scale
      const normalizedPopularity = popularity / 100;
      
      // Calculate happiness score with weighted components
      const happinessScore = (
        valence * 0.35 +                  // High valence (emotional positivity) is crucial
        energy * 0.20 +                   // Higher energy for upbeat feel
        danceability * 0.15 +             // Higher danceability for fun factor
        normalizedTempo * 0.10 +          // Medium to upbeat tempo (not too slow)
        normalizedMode * 0.10 +           // Prefer major keys for happier sound
        normalizedLoudness * 0.05 +       // Medium to higher loudness
        liveness * 0.05                   // Some live audience feel can boost happiness
      );
      
      return {
        ...song,
        happinessScore
      };
    });
    
    // Filter and sort by happiness score (higher is happier)
    // First, get all songs that meet our base criteria for happiness
    const potentialHappyRecommendations = recommendationsWithHappinessScore
      .filter(song => song.valence > 0.5); // Slightly relaxed valence requirement
    
    console.log(`Found ${potentialHappyRecommendations.length} potential happy songs with valence > 0.5`);
    
    // If not enough songs meet that criteria, just take the top songs by happiness score
    const happyRecommendations = potentialHappyRecommendations.length >= 50 
      ? potentialHappyRecommendations.sort((a, b) => b.happinessScore - a.happinessScore).slice(0, 100)
      : recommendationsWithHappinessScore.sort((a, b) => b.happinessScore - a.happinessScore).slice(0, 100);
    
    console.log(`Filtered down to ${happyRecommendations.length} happy recommendations`);
    
    // If we still don't have enough recommendations, log detailed information for debugging
    if (happyRecommendations.length < 10) {
      console.log("WARNING: Not enough happy songs found. Showing detailed diagnostics:");
      
      // Check all audio features in the dataset
      const audioFeatureStats = {};
      requiredFeatures.forEach(feature => {
        const values = allRecommendations
          .map(song => song[feature] || song[`${feature}_standardized`] || 0)
          .filter(val => typeof val === 'number');
        
        if (values.length > 0) {
          const min = Math.min(...values);
          const max = Math.max(...values);
          const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
          
          audioFeatureStats[feature] = { min, max, avg };
        } else {
          audioFeatureStats[feature] = "No valid values found";
        }
      });
      
      console.log("Audio feature statistics:", audioFeatureStats);
      
      // Print happiness scores distribution
      const happinessScores = recommendationsWithHappinessScore.map(s => s.happinessScore);
      const minScore = Math.min(...happinessScores);
      const maxScore = Math.max(...happinessScores);
      const avgScore = happinessScores.reduce((sum, val) => sum + val, 0) / happinessScores.length;
      
      console.log("Happiness scores - Min:", minScore, "Max:", maxScore, "Avg:", avgScore);
      
      // Show the top 10 songs with their happiness score components
      const topSongs = recommendationsWithHappinessScore
        .sort((a, b) => b.happinessScore - a.happinessScore)
        .slice(0, 10);
      
      console.log("Top 10 songs by happiness score with components:");
      topSongs.forEach(song => {
        const valence = song.valence || song.valence_standardized || 0;
        const energy = song.energy || song.energy_standardized || 0;
        const danceability = song.danceability || song.danceability_standardized || 0;
        
        console.log(`Song: ${song.name} - Score: ${song.happinessScore.toFixed(2)} - Valence: ${valence.toFixed(2)} - Energy: ${energy.toFixed(2)} - Danceability: ${danceability.toFixed(2)}`);
      });
    }
    
    // Add descriptive happiness categories based on score
    // Using slightly lower thresholds to account for the adjusted scoring algorithm
    const happinessCategories = [
      { threshold: 0.80, label: "Euphoric" },
      { threshold: 0.75, label: "Ecstatic" },
      { threshold: 0.70, label: "Joyful" },
      { threshold: 0.65, label: "Uplifting" },
      { threshold: 0.60, label: "Cheerful" },
      { threshold: 0, label: "Happy" }
    ];
    
    // Ensure recommendations have all required properties and add happiness category
    const cleanedRecommendations = happyRecommendations.map(rec => {
      // Determine happiness category based on score
      const category = happinessCategories.find(cat => rec.happinessScore >= cat.threshold);
      
      // Get underlying attributes for additional context
      const valence = rec.valence || rec.valence_standardized || 0;
      const energy = rec.energy || rec.energy_standardized || 0;
      const danceability = rec.danceability || rec.danceability_standardized || 0;
      const tempo = rec.tempo || rec.tempo_standardized || 0;
      const mode = rec.mode || rec.mode_standardized || 0;
      
      return {
        name: rec.name || "Unknown Track",
        artist: rec.artist || "Unknown Artist",
        genre: rec.genre || "Unknown Genre",
        score: typeof rec.score === 'number' ? rec.score.toFixed(2) : rec.score || "N/A",
        happinessScore: rec.happinessScore.toFixed(2),
        happinessCategory: category ? category.label : "Positive",
        // Add important attributes that contribute to happiness
        valence: valence.toFixed(2),
        energy: energy.toFixed(2),
        danceability: danceability.toFixed(2),
        tempo: Math.round(tempo),
        mode: mode === 1 ? "Major" : "Minor",
        id: rec.id || `local-${(rec.name || 'track').replace(/\s+/g, '-').toLowerCase()}`,
        albumCover: rec.albumCover || ''
      };
    });
    
    // Store playlist type and recommendations
    currentPlaylistType = "Uplifting Happy";
    console.log(`Setting current playlist type to: ${currentPlaylistType}`);
    
    // Add timestamp to help ensure we get different recommendations each time
    console.log(`Recommendation generated at: ${new Date().toISOString()}`);
    
    // Add a small cache-busting random value to ensure we get variety
    window.lastHappyRecommendationRun = Date.now() + Math.floor(Math.random() * 1000);
    
    // Store all happy recommendations for potential use in playlist creation
    lastCsvRecommendations = cleanedRecommendations;
    console.log(`Stored ${lastCsvRecommendations.length} cleaned happy recommendations`);
    
    // Randomly select 10 from the top recommendations using Fisher-Yates shuffle
    const shuffledRecommendations = [...cleanedRecommendations];
    
    // Fisher-Yates shuffle algorithm for true randomness
    for (let i = shuffledRecommendations.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledRecommendations[i], shuffledRecommendations[j]] = 
        [shuffledRecommendations[j], shuffledRecommendations[i]];
    }
    
    // Take 10 random songs from our shuffled array
    const selectedRecommendations = shuffledRecommendations.slice(0, 10);
    console.log(`Randomly selected ${selectedRecommendations.length} recommendations from top 100 happiest songs`);

    // Display the recommendations with the correct playlist type
    renderRecommendationsTemplate("csv-recommendations-results", {
      recommendations: selectedRecommendations,
      playlistType: currentPlaylistType
    });
  } catch (error) {
    console.error("Error generating happy recommendations:", error);
    
    // Provide more helpful error message to guide users
    let errorMessage = error.message;
    if (error.message.includes("not loaded")) {
      errorMessage += " This may be because the dataset is still loading. Please wait a moment and try again.";
    }
    
    document.getElementById('csv-recommendations-results').innerHTML = 
      `<div class="error-message">Error generating uplifting happy recommendations: ${errorMessage}</div>`;
  }
}

// Function to generate intensely sad recommendations using multiple audio attributes
async function generateSadRecommendations() {
  try {
    // Show loading indicator
    document.getElementById('csv-recommendations-results').innerHTML = 
      '<p class="loading">Generating deeply sad song recommendations...</p>';
    
    // Check if engine exists
    if (!window.recommendationEngine) {
      window.recommendationEngine = new window.RecommendationEngine();
      
      // Since we're creating it now, we need to load dataset
      const datasetStatus = document.getElementById('dataset-status');
      if (datasetStatus) {
        datasetStatus.textContent = "Please wait while we load the dataset...";
      }
      
      // Attempt to reload dataset
      await loadDefaultDataset();
    }
    
    // Clear check for dataset and liked songs with better user guidance
    if (!window.recommendationEngine.dataset) {
      throw new Error("Dataset not loaded. Please refresh the page to load the default dataset.");
    }
    
    if (!window.recommendationEngine.likedSongs) {
      // If user is logged in, try to auto-load liked songs
      if (currentToken.access_token) {
        const loaded = await autoLoadLikedSongs();
        if (!loaded) {
          throw new Error("Could not load your Spotify liked songs. Please use the 'Use Spotify Liked Songs' button in the Liked Songs section.");
        }
      } else {
        throw new Error("Please load your liked songs first using the 'Use Spotify Liked Songs' button or upload a CSV.");
      }
    }
    
    console.log("Starting sad song recommendation generation with:", {
      datasetSize: window.recommendationEngine.dataset.length,
      likedSongsSize: window.recommendationEngine.likedSongs.length
    });
    
    // Get a sample song to check the dataset structure
    const sampleSong = window.recommendationEngine.dataset[0];
    console.log("Sample song from dataset:", sampleSong);
    
    // Make sure required features exist in the dataset
    const requiredFeatures = [
      'popularity', 'danceability', 'energy', 'acousticness', 
      'valence', 'tempo', 'liveness', 'instrumentalness'
    ];
    
    const missingFeatures = requiredFeatures.filter(feature => 
      !sampleSong.hasOwnProperty(feature) && !sampleSong.hasOwnProperty(`${feature}_standardized`)
    );
    
    if (missingFeatures.length > 0) {
      console.warn("Dataset is missing these features:", missingFeatures);
      // If features are missing, add dummy values
      window.recommendationEngine.dataset.forEach(song => {
        missingFeatures.forEach(feature => {
          song[feature] = Math.random() * 0.5 + 0.25; // Random value between 0.25 and 0.75
        });
      });
      // Reprocess data with added features
      window.recommendationEngine.preprocessData();
    }
    
    // Force preprocessing before generating recommendations
    console.log("Preprocessing data...");
    window.recommendationEngine.preprocessData();
    
    // Generate 200 recommendations (larger pool to filter from)
    console.log("Calling recommendSongs method to get 200 recommendations...");
    const allRecommendations = window.recommendationEngine.recommendSongs(200);
    console.log(`Generated ${allRecommendations.length} total recommendations`);
    
    if (!allRecommendations || allRecommendations.length === 0) {
      throw new Error("No recommendations were generated. Try using different liked songs.");
    }
    
    // Calculate a comprehensive "sadness score" using multiple attributes
    // This weighted formula prioritizes emotional aspects of the music
    const recommendationsWithSadnessScore = allRecommendations.map(song => {
      // Get all relevant attributes (or their standardized versions)
      const valence = song.valence || song.valence_standardized || 0.5;
      const energy = song.energy || song.energy_standardized || 0.5;
      const danceability = song.danceability || song.danceability_standardized || 0.5;
      const tempo = song.tempo || song.tempo_standardized || 120;
      const acousticness = song.acousticness || song.acousticness_standardized || 0.5;
      const liveness = song.liveness || song.liveness_standardized || 0.5;
      const instrumentalness = song.instrumentalness || song.instrumentalness_standardized || 0;
      
      // Normalize tempo to a 0-1 scale (assuming typical range of 40-200 BPM)
      // Lower tempo is often associated with sadder music
      const normalizedTempo = Math.max(0, Math.min(1, (tempo - 40) / 160));
      
      // Calculate sadness score with weighted components
      // The formula heavily weights valence (emotional positivity) as the primary indicator of sadness
      const sadnessScore = (
        (1 - valence) * 0.35 +           // Low valence (heavily weighted - most important for sadness)
        (1 - energy) * 0.20 +            // Low energy (sad songs tend to be less energetic)
        (1 - danceability) * 0.15 +      // Low danceability (sad songs are less danceable)
        (1 - normalizedTempo) * 0.10 +   // Slower tempo
        acousticness * 0.10 +            // Higher acousticness (often correlates with emotional songs)
        (1 - liveness) * 0.05 +          // Lower liveness (sad songs tend to be more intimate/studio)
        instrumentalness * 0.05          // Slight preference for instrumental (can be deeply emotional)
      );
      
      return {
        ...song,
        sadnessScore
      };
    });
    
    // Filter and sort by sadness score (higher is sadder)
    const sadRecommendations = recommendationsWithSadnessScore
      .sort((a, b) => b.sadnessScore - a.sadnessScore) // Sort descending by sadness score
      .slice(0, 100); // Take top 100 saddest songs
    
    console.log(`Filtered down to ${sadRecommendations.length} sad recommendations`);
    
    // Add descriptive sadness categories based on score
    const sadnessCategories = [
      { threshold: 0.85, label: "Heartbreaking" },
      { threshold: 0.75, label: "Melancholic" },
      { threshold: 0.65, label: "Wistful" },
      { threshold: 0.55, label: "Somber" },
      { threshold: 0.45, label: "Sad" },
      { threshold: 0, label: "Slightly Sad" }
    ];
    
    // Ensure recommendations have all required properties and add sadness category
    const cleanedRecommendations = sadRecommendations.map(rec => {
      // Determine sadness category based on score
      const category = sadnessCategories.find(cat => rec.sadnessScore >= cat.threshold);
      
      return {
        name: rec.name || "Unknown Track",
        artist: rec.artist || "Unknown Artist",
        genre: rec.genre || "Unknown Genre",
        score: typeof rec.score === 'number' ? rec.score.toFixed(2) : rec.score || "N/A",
        sadnessScore: rec.sadnessScore.toFixed(2),
        sadnessCategory: category ? category.label : "Slightly Sad",
        valence: (rec.valence || rec.valence_standardized || 0).toFixed(2),
        energy: (rec.energy || rec.energy_standardized || 0).toFixed(2),
        tempo: Math.round(rec.tempo || rec.tempo_standardized || 0),
        id: rec.id || `local-${(rec.name || 'track').replace(/\s+/g, '-').toLowerCase()}`,
        albumCover: rec.albumCover || ''
      };
    });
    
    // Store playlist type and recommendations
    currentPlaylistType = "Deeply Sad";
    console.log(`Setting current playlist type to: ${currentPlaylistType}`);
    
    // Add timestamp to help ensure we get different recommendations each time
    console.log(`Recommendation generated at: ${new Date().toISOString()}`);
    
    // Add a small cache-busting random value to ensure we get variety
    window.lastSadRecommendationRun = Date.now() + Math.floor(Math.random() * 1000);
    
    // Store all sad recommendations for potential use in playlist creation
    lastCsvRecommendations = cleanedRecommendations;
    console.log(`Stored ${lastCsvRecommendations.length} cleaned sad recommendations`);
    
    // Randomly select 10 songs from the top 100 saddest songs
    const shuffledRecommendations = [...cleanedRecommendations];
    
    // Fisher-Yates shuffle algorithm for true randomness
    for (let i = shuffledRecommendations.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledRecommendations[i], shuffledRecommendations[j]] = 
        [shuffledRecommendations[j], shuffledRecommendations[i]];
    }
    
    // Take 10 random songs from our shuffled array
    const selectedRecommendations = shuffledRecommendations.slice(0, 10);
    console.log(`Selected ${selectedRecommendations.length} random recommendations from top 100 saddest songs`);

    // Display the recommendations with the correct playlist type
    renderRecommendationsTemplate("csv-recommendations-results", {
      recommendations: selectedRecommendations,
      playlistType: currentPlaylistType
    });
    
  } catch (error) {
    console.error("Error generating sad recommendations:", error);
    
    // Provide more helpful error message to guide users
    let errorMessage = error.message;
    if (error.message.includes("not loaded")) {
      errorMessage += " This may be because the dataset is still loading. Please wait a moment and try again.";
    }
    
    document.getElementById('csv-recommendations-results').innerHTML = 
      `<div class="error-message">Error generating deeply sad recommendations: ${errorMessage}</div>`;
  }
}

// Function to generate ultra-chill recommendations using sophisticated audio features
async function generateChillRecommendations() {
  try {
    // Show loading indicator
    document.getElementById('csv-recommendations-results').innerHTML = 
      '<p class="loading">Generating ultra-chill song recommendations...</p>';
    
    // Check if engine exists
    if (!window.recommendationEngine) {
      window.recommendationEngine = new window.RecommendationEngine();
      
      // Since we're creating it now, we need to load dataset
      const datasetStatus = document.getElementById('dataset-status');
      if (datasetStatus) {
        datasetStatus.textContent = "Please wait while we load the dataset...";
      }
      
      // Attempt to reload dataset
      await loadDefaultDataset();
    }
    
    // Clear check for dataset and liked songs with better user guidance
    if (!window.recommendationEngine.dataset) {
      throw new Error("Dataset not loaded. Please refresh the page to load the default dataset.");
    }
    
    if (!window.recommendationEngine.likedSongs) {
      // If user is logged in, try to auto-load liked songs
      if (currentToken.access_token) {
        const loaded = await autoLoadLikedSongs();
        if (!loaded) {
          throw new Error("Could not load your Spotify liked songs. Please use the 'Use Spotify Liked Songs' button in the Liked Songs section.");
        }
      } else {
        throw new Error("Please load your liked songs first using the 'Use Spotify Liked Songs' button or upload a CSV.");
      }
    }
    
    console.log("Starting ultra-chill song recommendation generation with:", {
      datasetSize: window.recommendationEngine.dataset.length,
      likedSongsSize: window.recommendationEngine.likedSongs.length
    });
    
    // Get a sample song to check the dataset structure
    const sampleSong = window.recommendationEngine.dataset[0];
    console.log("Sample song from dataset:", sampleSong);
    
    // Make sure required features exist in the dataset
    const requiredFeatures = [
      'popularity', 'danceability', 'energy', 'acousticness', 
      'valence', 'tempo', 'liveness', 'instrumentalness', 'speechiness', 'loudness'
    ];
    
    const missingFeatures = requiredFeatures.filter(feature => 
      !sampleSong.hasOwnProperty(feature) && !sampleSong.hasOwnProperty(`${feature}_standardized`)
    );
    
    if (missingFeatures.length > 0) {
      console.warn("Dataset is missing these features:", missingFeatures);
      // If features are missing, add dummy values
      window.recommendationEngine.dataset.forEach(song => {
        missingFeatures.forEach(feature => {
          song[feature] = Math.random() * 0.5 + 0.25; // Random value between 0.25 and 0.75
        });
      });
      // Reprocess data with added features
      window.recommendationEngine.preprocessData();
    }
    
    // Force preprocessing before generating recommendations
    console.log("Preprocessing data...");
    window.recommendationEngine.preprocessData();
    
    // Generate 200 recommendations
    console.log("Calling recommendSongs method to get 200 recommendations...");
    const allRecommendations = window.recommendationEngine.recommendSongs(200);
    console.log(`Generated ${allRecommendations.length} total recommendations`);
    
    if (!allRecommendations || allRecommendations.length === 0) {
      throw new Error("No recommendations were generated. Try using different liked songs.");
    }
    
    // Calculate a comprehensive "chill score" using multiple attributes
    const recommendationsWithChillScore = allRecommendations.map(song => {
      // Get all relevant attributes (or their standardized versions)
      const energy = song.energy || song.energy_standardized || 0.5;
      const acousticness = song.acousticness || song.acousticness_standardized || 0.5;
      const tempo = song.tempo || song.tempo_standardized || 120;
      const danceability = song.danceability || song.danceability_standardized || 0.5;
      const instrumentalness = song.instrumentalness || song.instrumentalness_standardized || 0;
      const valence = song.valence || song.valence_standardized || 0.5;
      const liveness = song.liveness || song.liveness_standardized || 0.5;
      const speechiness = song.speechiness || song.speechiness_standardized || 0.5;
      const loudness = song.loudness || song.loudness_standardized || -10;
      
      // Normalize tempo to a 0-1 scale (assuming typical range of 40-200 BPM)
      // For chill music, we want moderate to slow tempo
      const normalizedTempo = Math.max(0, Math.min(1, (tempo - 40) / 160));
      
      // Normalize loudness (typically ranges from -60 to 0 dB)
      // For chill music, we want quieter tracks
      const normalizedLoudness = Math.max(0, Math.min(1, (loudness + 60) / 60));
      
      // Calculate chill score with weighted components
      // Note: This is distinctly different from "sadness" - we want relaxed but not necessarily sad
      const chillScore = (
        (1 - energy) * 0.25 +               // Low energy is chiller
        acousticness * 0.20 +               // Higher acousticness for natural, organic sounds
        (1 - normalizedTempo) * 0.15 +      // Slower tempo is chiller
        (1 - normalizedLoudness) * 0.15 +   // Quieter songs are chiller
        instrumentalness * 0.10 +           // Instrumental music can be very chill
        (1 - liveness) * 0.05 +             // Studio recordings tend to be more carefully produced
        (1 - speechiness) * 0.05 +          // Less talking/rapping
        // Medium valence - not too sad, not too happy - perfect for chill
        (1 - Math.abs(valence - 0.5)) * 0.05
      );
      
      return {
        ...song,
        chillScore
      };
    });
    
    // Filter and sort by chill score (higher is chiller)
    const chillRecommendations = recommendationsWithChillScore
      .sort((a, b) => b.chillScore - a.chillScore) // Sort descending by chill score
      .slice(0, 100); // Take top 100 chillest songs
    
    console.log(`Filtered down to ${chillRecommendations.length} ultra-chill recommendations`);
    
    // Add descriptive chill categories based on score
    const chillCategories = [
      { threshold: 0.85, label: "Zen-Master" },
      { threshold: 0.75, label: "Ultra-Relaxed" },
      { threshold: 0.65, label: "Super-Chill" },
      { threshold: 0.55, label: "Laid-Back" },
      { threshold: 0.45, label: "Mellow" },
      { threshold: 0, label: "Chill" }
    ];
    
    // Ensure recommendations have all required properties and add chill category
    const cleanedRecommendations = chillRecommendations.map(rec => {
      // Determine chill category based on score
      const category = chillCategories.find(cat => rec.chillScore >= cat.threshold);
      
      // Get underlying attributes for additional context
      const energy = rec.energy || rec.energy_standardized || 0;
      const acousticness = rec.acousticness || rec.acousticness_standardized || 0;
      const tempo = rec.tempo || rec.tempo_standardized || 0;
      const instrumentalness = rec.instrumentalness || rec.instrumentalness_standardized || 0;
      
      return {
        name: rec.name || "Unknown Track",
        artist: rec.artist || "Unknown Artist",
        genre: rec.genre || "Unknown Genre",
        score: typeof rec.score === 'number' ? rec.score.toFixed(2) : rec.score || "N/A",
        chillScore: rec.chillScore.toFixed(2),
        chillCategory: category ? category.label : "Easy-Going",
        // Add important attributes that contribute to chillness
        energy: energy.toFixed(2),
        acousticness: acousticness.toFixed(2),
        tempo: Math.round(tempo),
        instrumentalness: instrumentalness.toFixed(2),
        id: rec.id || `local-${(rec.name || 'track').replace(/\s+/g, '-').toLowerCase()}`,
        albumCover: rec.albumCover || ''
      };
    });
    
    // Store playlist type and recommendations
    currentPlaylistType = "Ultra-Chill";
    console.log(`Setting current playlist type to: ${currentPlaylistType}`);
    
    // Add timestamp to help ensure we get different recommendations each time
    console.log(`Recommendation generated at: ${new Date().toISOString()}`);
    
    // Add a small cache-busting random value to ensure we get variety
    window.lastChillRecommendationRun = Date.now() + Math.floor(Math.random() * 1000);
    
    // Store all chill recommendations for potential use in playlist creation
    lastCsvRecommendations = cleanedRecommendations;
    console.log(`Stored ${lastCsvRecommendations.length} cleaned ultra-chill recommendations`);
    
    // Randomly select 10 from the top chill recommendations using Fisher-Yates shuffle
    const shuffledRecommendations = [...cleanedRecommendations];
    
    // Fisher-Yates shuffle algorithm for true randomness
    for (let i = shuffledRecommendations.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledRecommendations[i], shuffledRecommendations[j]] = 
        [shuffledRecommendations[j], shuffledRecommendations[i]];
    }
    
    // Take 10 random songs from our shuffled array
    const selectedRecommendations = shuffledRecommendations.slice(0, 10);
    console.log(`Randomly selected ${selectedRecommendations.length} recommendations from top 100 chillest songs`);

    // Display the recommendations with the correct playlist type
    renderRecommendationsTemplate("csv-recommendations-results", {
      recommendations: selectedRecommendations,
      playlistType: currentPlaylistType
    });
  } catch (error) {
    console.error("Error generating ultra-chill recommendations:", error);
    
    // Provide more helpful error message to guide users
    let errorMessage = error.message;
    if (error.message.includes("not loaded")) {
      errorMessage += " This may be because the dataset is still loading. Please wait a moment and try again.";
    }
    
    document.getElementById('csv-recommendations-results').innerHTML = 
      `<div class="error-message">Error generating ultra-chill recommendations: ${errorMessage}</div>`;
  }
}

// Function to generate hyper-energetic recommendations using sophisticated audio features
async function generateEnergeticRecommendations() {
  try {
    // Show loading indicator
    document.getElementById('csv-recommendations-results').innerHTML = 
      '<p class="loading">Generating hyper-energetic song recommendations...</p>';
    
    // Check if engine exists
    if (!window.recommendationEngine) {
      window.recommendationEngine = new window.RecommendationEngine();
      
      // Since we're creating it now, we need to load dataset
      const datasetStatus = document.getElementById('dataset-status');
      if (datasetStatus) {
        datasetStatus.textContent = "Please wait while we load the dataset...";
      }
      
      // Attempt to reload dataset
      await loadDefaultDataset();
    }
    
    // Clear check for dataset and liked songs with better user guidance
    if (!window.recommendationEngine.dataset) {
      throw new Error("Dataset not loaded. Please refresh the page to load the default dataset.");
    }
    
    if (!window.recommendationEngine.likedSongs) {
      // If user is logged in, try to auto-load liked songs
      if (currentToken.access_token) {
        const loaded = await autoLoadLikedSongs();
        if (!loaded) {
          throw new Error("Could not load your Spotify liked songs. Please use the 'Use Spotify Liked Songs' button in the Liked Songs section.");
        }
      } else {
        throw new Error("Please load your liked songs first using the 'Use Spotify Liked Songs' button or upload a CSV.");
      }
    }
    
    console.log("Starting hyper-energetic song recommendation generation with:", {
      datasetSize: window.recommendationEngine.dataset.length,
      likedSongsSize: window.recommendationEngine.likedSongs.length
    });
    
    // Get a sample song to check the dataset structure
    const sampleSong = window.recommendationEngine.dataset[0];
    console.log("Sample song from dataset:", sampleSong);
    
    // Make sure required features exist in the dataset
    const requiredFeatures = [
      'popularity', 'danceability', 'energy', 'acousticness', 
      'valence', 'tempo', 'liveness', 'loudness', 'key'
    ];
    
    const missingFeatures = requiredFeatures.filter(feature => 
      !sampleSong.hasOwnProperty(feature) && !sampleSong.hasOwnProperty(`${feature}_standardized`)
    );
    
    if (missingFeatures.length > 0) {
      console.warn("Dataset is missing these features:", missingFeatures);
      // If features are missing, add dummy values
      window.recommendationEngine.dataset.forEach(song => {
        missingFeatures.forEach(feature => {
          song[feature] = Math.random() * 0.5 + 0.25; // Random value between 0.25 and 0.75
        });
      });
      // Reprocess data with added features
      window.recommendationEngine.preprocessData();
    }
    
    // Force preprocessing before generating recommendations
    console.log("Preprocessing data...");
    window.recommendationEngine.preprocessData();
    
    // Generate 200 recommendations
    console.log("Calling recommendSongs method to get 200 recommendations...");
    const allRecommendations = window.recommendationEngine.recommendSongs(200);
    console.log(`Generated ${allRecommendations.length} total recommendations`);
    
    if (!allRecommendations || allRecommendations.length === 0) {
      throw new Error("No recommendations were generated. Try using different liked songs.");
    }
    
    // Calculate a comprehensive "energy score" using multiple attributes
    const recommendationsWithEnergyScore = allRecommendations.map(song => {
      // Get all relevant attributes (or their standardized versions)
      const energy = song.enerfgy || song.energy_standardized || 0.5;
      const tempo = song.tempo || song.tempo_standardized || 120;
      const danceability = song.danceability || song.danceability_standardized || 0.5;
      const valence = song.valence || song.valence_standardized || 0.5;
      const liveness = song.liveness || song.liveness_standardized || 0.5;
      const loudness = song.loudness || song.loudness_standardized || -10;
      const acousticness = song.acousticness || song.acousticness_standardized || 0.5;
      
      // Normalize tempo to a 0-1 scale (assuming max tempo ~200 BPM)
      // For energetic music, faster is better
      const normalizedTempo = Math.min(tempo / 180, 1);
      
      // Normalize loudness (typically ranges from -60 to 0 dB)
      // For energetic music, louder is better
      const normalizedLoudness = Math.max(0, Math.min(1, (loudness + 30) / 30));
      
      // Calculate energy score with weighted components
      // Note: This is focused on pure energy, not happiness (so valence isn't weighted as much)
      const energyScore = (
        energy * 0.30 +                  // High energy is critical
        normalizedTempo * 0.20 +         // Faster tempo for more drive
        normalizedLoudness * 0.15 +      // Louder songs feel more energetic
        danceability * 0.15 +            // Danceable tracks get people moving
        liveness * 0.10 +                // Live recordings often have more energy
        (1 - acousticness) * 0.05 +      // Electronic/produced tracks typically more energetic 
        valence * 0.05                   // Slightly favor positive valence but not a huge factor
      );
      
      return {
        ...song,
        energyScore
      };
    });
    
    // Filter and sort by energy score (higher is more energetic)
    const energeticRecommendations = recommendationsWithEnergyScore
      .sort((a, b) => b.energyScore - a.energyScore) // Sort descending by energy score
      .slice(0, 100); // Take top 100 most energetic songs
    
    console.log(`Filtered down to ${energeticRecommendations.length} hyper-energetic recommendations`);
    
    // Add descriptive energy categories based on score
    const energyCategories = [
      { threshold: 0.90, label: "Explosive" },
      { threshold: 0.85, label: "Electrifying" },
      { threshold: 0.80, label: "Supercharged" },
      { threshold: 0.75, label: "High-Octane" },
      { threshold: 0.70, label: "High-Voltage" },
      { threshold: 0, label: "Energetic" }
    ];
    
    // Ensure recommendations have all required properties and add energy category
    const cleanedRecommendations = energeticRecommendations.map(rec => {
      // Determine energy category based on score
      const category = energyCategories.find(cat => rec.energyScore >= cat.threshold);
      
      // Get underlying attributes for additional context
      const energy = rec.energy || rec.energy_standardized || 0;
      const tempo = rec.tempo || rec.tempo_standardized || 0;
      const danceability = rec.danceability || rec.danceability_standardized || 0;
      const loudness = rec.loudness || rec.loudness_standardized || 0;
      
      return {
        name: rec.name || "Unknown Track",
        artist: rec.artist || "Unknown Artist",
        genre: rec.genre || "Unknown Genre",
        score: typeof rec.score === 'number' ? rec.score.toFixed(2) : rec.score || "N/A",
        energyScore: rec.energyScore.toFixed(2),
        energyCategory: category ? category.label : "Energetic",
        // Add important attributes that contribute to energy
        energy: energy.toFixed(2),
        tempo: Math.round(tempo),
        danceability: danceability.toFixed(2),
        loudness: loudness.toFixed(1),
        id: rec.id || `local-${(rec.name || 'track').replace(/\s+/g, '-').toLowerCase()}`,
        albumCover: rec.albumCover || ''
      };
    });
    
    // Store playlist type and recommendations
    currentPlaylistType = "Hyper-Energetic";
    console.log(`Setting current playlist type to: ${currentPlaylistType}`);
    
    // Add timestamp to help ensure we get different recommendations each time
    console.log(`Recommendation generated at: ${new Date().toISOString()}`);
    
    // Add a small cache-busting random value to ensure we get variety
    window.lastEnergeticRecommendationRun = Date.now() + Math.floor(Math.random() * 1000);
    
    // Store all energetic recommendations for potential use in playlist creation
    lastCsvRecommendations = cleanedRecommendations;
    console.log(`Stored ${lastCsvRecommendations.length} cleaned hyper-energetic recommendations`);
    
    // Randomly select 10 from the top energetic recommendations using Fisher-Yates shuffle
    const shuffledRecommendations = [...cleanedRecommendations];
    
    // Fisher-Yates shuffle algorithm for true randomness
    for (let i = shuffledRecommendations.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledRecommendations[i], shuffledRecommendations[j]] = 
        [shuffledRecommendations[j], shuffledRecommendations[i]];
    }
    
    // Take 10 random songs from our shuffled array
    const selectedRecommendations = shuffledRecommendations.slice(0, 10);
    console.log(`Randomly selected ${selectedRecommendations.length} recommendations from top 100 most energetic songs`);

    // Display the recommendations with the correct playlist type
    renderRecommendationsTemplate("csv-recommendations-results", {
      recommendations: selectedRecommendations,
      playlistType: currentPlaylistType
    });
  } catch (error) {
    console.error("Error generating hyper-energetic recommendations:", error);
    
    // Provide more helpful error message to guide users
    let errorMessage = error.message;
    if (error.message.includes("not loaded")) {
      errorMessage += " This may be because the dataset is still loading. Please wait a moment and try again.";
    }
    
    document.getElementById('csv-recommendations-results').innerHTML = 
      `<div class="error-message">Error generating hyper-energetic recommendations: ${errorMessage}</div>`;
  }
}

// Update the renderRecommendationsTemplate function to include the callback to our save function
// Updated renderRecommendationsTemplate function to ensure proper order of track information
function renderRecommendationsTemplate(targetId, { recommendations, playlistType, originalRequest }) {
  const targetElement = document.getElementById(targetId);
  if (!targetElement) {
    console.error(`Target element not found: ${targetId}`);
    return;
  }

  if (!recommendations || recommendations.length === 0) {
    targetElement.innerHTML = '<p>No recommendations found.</p>';
    return;
  }

  // Store the displayed recommendations globally so we can save just these songs
  lastDisplayedRecommendations = recommendations;
  console.log(`Stored ${lastDisplayedRecommendations.length} displayed recommendations for potential playlist creation`);

  // Clear the existing content
  targetElement.innerHTML = "";

  // Create a container for the recommendations
  const recommendationsContainer = document.createElement("div");
  recommendationsContainer.className = "song-recommendations";
  
  // Update heading to include playlist type if available
  const headingText = playlistType 
    ? `${playlistType} Song Recommendations` 
    : "Song Recommendations";
  recommendationsContainer.innerHTML = `<h3>${headingText}</h3>`;

  // Add notice if we're showing songs based on a different track than requested
  if (originalRequest) {
    const noticeBox = document.createElement("div");
    noticeBox.className = "recommendation-notice";
    noticeBox.innerHTML = `
      <p>We couldn't find "${originalRequest.trackName}" by ${originalRequest.artistName} in our database, 
      so we're showing recommendations based on other songs by ${originalRequest.artistName} or similar artists.</p>
    `;
    recommendationsContainer.appendChild(noticeBox);
  }

  // Create the track list and append each track dynamically
  const trackList = document.createElement("div");
  trackList.className = "track-list";

  recommendations.forEach(track => {
    const trackItem = document.createElement("div");
    trackItem.className = "track-item";

    const trackInfo = document.createElement("div");
    trackInfo.className = "track-info";

    // First add track name (title)
    const trackName = document.createElement("div");
    trackName.className = "track-name";
    trackName.textContent = track.name;
    trackInfo.appendChild(trackName);

    // Then add artist name
    const trackArtist = document.createElement("div");
    trackArtist.className = "track-artist";
    trackArtist.textContent = track.artist;
    trackInfo.appendChild(trackArtist);

    // Only after title and artist, add genre if available
    if (track.genre && track.genre !== "Unknown Genre") {
      const trackGenre = document.createElement("div");
      trackGenre.className = "track-genre";
      trackGenre.textContent = `Genre: ${track.genre}`;
      trackInfo.appendChild(trackGenre);
    }

    // Finally add score if available
    if (track.score && track.score !== "N/A") {
      const trackScore = document.createElement("div");
      trackScore.className = "track-score";
      trackScore.textContent = `Score: ${track.score}`;
      trackInfo.appendChild(trackScore);
    }

    // Add any special category/score information (for mood-based playlists)
    if (track.happinessCategory) {
      const moodCategory = document.createElement("div");
      moodCategory.className = "mood-category";
      moodCategory.textContent = `Mood: ${track.happinessCategory}`;
      trackInfo.appendChild(moodCategory);
    } else if (track.sadnessCategory) {
      const moodCategory = document.createElement("div");
      moodCategory.className = "mood-category";
      moodCategory.textContent = `Mood: ${track.sadnessCategory}`;
      trackInfo.appendChild(moodCategory);
    } else if (track.chillCategory) {
      const moodCategory = document.createElement("div");
      moodCategory.className = "mood-category";
      moodCategory.textContent = `Vibe: ${track.chillCategory}`;
      trackInfo.appendChild(moodCategory);
    } else if (track.energyCategory) {
      const moodCategory = document.createElement("div");
      moodCategory.className = "mood-category";
      moodCategory.textContent = `Vibe: ${track.energyCategory}`;
      trackInfo.appendChild(moodCategory);
    }

    trackItem.appendChild(trackInfo);

    // Album cover (if available)
    if (track.albumCover) {
      const albumImage = document.createElement("img");
      albumImage.src = track.albumCover;
      albumImage.alt = "Album cover";
      albumImage.className = "album-cover";
      trackItem.appendChild(albumImage);
    }

    // Add to track list
    trackList.appendChild(trackItem);
  });

  recommendationsContainer.appendChild(trackList);
  
  // Create playlist actions container with Save to Spotify button
  const playlistActions = document.createElement("div");
  playlistActions.className = "playlist-actions";
  
  // Create save to Spotify button with playlist type in the text
  const saveButton = document.createElement("button");
  saveButton.className = "save-spotify-btn";
  saveButton.textContent = playlistType 
    ? `Save "${playlistType}" Playlist to Spotify` 
    : "Save to Spotify";
  
  // Use the appropriate save function based on the context
  if (playlistType && playlistType.includes("Based on")) {
    saveButton.onclick = function() {
      window.saveTrackBasedPlaylistToSpotify();
    };
  } else {
    saveButton.onclick = function() {
      window.saveCSVRecommendationsToSpotify();
    };
  }
  
  // Append button to playlist actions
  playlistActions.appendChild(saveButton);
  
  // Append playlist actions to the recommendations container
  recommendationsContainer.appendChild(playlistActions);
  
  targetElement.appendChild(recommendationsContainer);
}

// Fix the save function to save only the displayed 10 songs
async function saveCSVRecommendationsToSpotify() {
  // Check if we have displayed recommendations
  if (!lastDisplayedRecommendations || lastDisplayedRecommendations.length === 0) {
    alert("Please generate recommendations first");
    return;
  }
  
  try {
    console.log(`Saving ${currentPlaylistType || "Recommended"} playlist to Spotify with ${lastDisplayedRecommendations.length} songs...`);
    
    const saveButton = document.querySelector('#csv-recommendations-results .save-spotify-btn');
    if (saveButton) {
      saveButton.textContent = "Saving...";
      saveButton.disabled = true;
    } else {
      console.warn("Save button not found in #csv-recommendations-results");
    }
    
    // Convert local recommendations to Spotify format if needed
    const trackUris = [];
    const tracksToFind = [];
    
    // Separate tracks with Spotify IDs from those that need to be searched
    lastDisplayedRecommendations.forEach(track => {
      if (track.id && !track.id.startsWith('local-')) {
        trackUris.push(`spotify:track:${track.id}`);
      } else {
        tracksToFind.push({
          name: track.name,
          artist: track.artist
        });
      }
    });
    
    // Search for tracks that don't have IDs
    if (tracksToFind.length > 0) {
      for (const track of tracksToFind) {
        try {
          // Search Spotify for the track
          const query = `${track.name} artist:${track.artist}`;
          const searchResults = await searchSpotify(query, 'track', 1);
          
          if (searchResults && searchResults.length > 0) {
            trackUris.push(`spotify:track:${searchResults[0].id}`);
          } else {
            console.warn(`Could not find track on Spotify: ${track.name} by ${track.artist}`);
          }
        } catch (error) {
          console.error(`Error searching for track ${track.name}:`, error);
        }
      }
    }
    
    // Use the currentPlaylistType when creating the playlist name
    const playlistType = currentPlaylistType || "Recommended";
    const playlistName = `${playlistType} Songs by Spotify Genie`;
    const result = await savePlaylistToSpotify(playlistName, trackUris);
    
    // Update UI based on result
    if (result.success) {
      // Create success message with link
      const recommendationsResults = document.getElementById('csv-recommendations-results');
      const successMessage = document.createElement('div');
      successMessage.className = 'success-message';
      successMessage.innerHTML = `
        <p>Playlist "${result.playlistName}" with ${trackUris.length} songs saved successfully!</p>
        <a href="${result.playlistUrl}" target="_blank" class="spotify-button">
          <i class="fab fa-spotify" style="color: green;"></i> Open in Spotify
        </a>
      `;
      
      // Add success message to the container
      recommendationsResults.appendChild(successMessage);
      
      // Update button
      if (saveButton) {
        saveButton.textContent = "Saved to Spotify ✓";
        saveButton.disabled = true;
      }
    } else {
      // Show error
      alert(`Failed to save playlist: ${result.error}`);
      
      // Reset button
      if (saveButton) {
        saveButton.textContent = `Save ${playlistType} Playlist to Spotify`;
        saveButton.disabled = false;
      }
    }
  } catch (error) {
    console.error("Error saving recommendations to Spotify:", error);
    alert(`Error saving recommendations: ${error.message}`);
    
    // Reset button
    const saveButton = document.querySelector('#csv-recommendations-results .save-spotify-btn');
    if (saveButton) {
      saveButton.textContent = `Save ${currentPlaylistType || "Recommendations"} to Spotify`;
      saveButton.disabled = false;
    }
  }
}

// Global variable to store last generated CSV recommendations
let lastCsvRecommendations = null;

async function createPlaylistFromTrack(trackId, trackName, artistName) {
  try {
    console.log(`Creating playlist based on: ${trackName} by ${artistName} (ID: ${trackId})`);
    
    // Show loading indicator
    document.getElementById('search-results').innerHTML = 
      '<div class="loading-message">Creating playlist based on this song...</div>';
    
    // Initialize recommendation engine if not already done
    if (!window.recommendationEngine) {
      console.log("Creating recommendation engine instance");
      window.recommendationEngine = new window.RecommendationEngine();
      
      // Load the dataset if not already loaded
      if (!window.recommendationEngine.dataset) {
        console.log("Loading default dataset");
        await loadDefaultDataset();
      }
    }
    
    // Make sure dataset is loaded
    if (!window.recommendationEngine.dataset || window.recommendationEngine.dataset.length === 0) {
      throw new Error("Dataset not loaded. Please refresh and try again.");
    }
    
    console.log(`Looking for song "${trackName}" by "${artistName}" in the dataset...`);
    
    // Search for the exact song in the dataset
    const foundTrack = findTrackInDataset(trackName, artistName);
    let seedTrack;
    let playlistSource = trackName; // Default playlist source for UI display
    let usingOriginalRequest = true;
    let originalRequest = null;
    
    if (foundTrack) {
      // If exact song found, use it as the seed
      console.log("Found exact song match in dataset:", foundTrack);
      seedTrack = {
        Name: trackName,
        Artist: artistName
      };
    } else {
      // If exact song not found, try to find any songs by the same artist
      console.log("Exact song not found, looking for ANY songs by the same artist...");
      
      // Find ALL songs by the same artist
      const artistTracks = findAllArtistTracksInDataset(artistName);
      
      if (artistTracks && artistTracks.length > 0) {
        // If artist songs found, randomly pick one to use as seed
        const randomIndex = Math.floor(Math.random() * artistTracks.length);
        const selectedArtistTrack = artistTracks[randomIndex];
        
        console.log(`Found ${artistTracks.length} songs by the same artist. Selected:`, selectedArtistTrack);
        
        // Use the found artist track, but keep the artist name for display
        seedTrack = {
          Name: selectedArtistTrack.track_name || trackName,
          Artist: artistName
        };
        
        // Update the playlist source to indicate we're using another song by the artist
        playlistSource = `${artistName}'s Music`;
        usingOriginalRequest = false;
        originalRequest = { trackName, artistName };
        
      } else {
        // If no artist songs found, use a popular track as fallback
        console.log("No songs by this artist found, using a popular song as seed");
        const popularTrack = findPopularTrackInDataset();
        
        if (popularTrack) {
          console.log("Using popular track as reference:", popularTrack);
          seedTrack = {
            Name: popularTrack.track_name || trackName,
            Artist: popularTrack.artists || artistName
          };
          
          // Update playlist source to indicate we're showing general recommendations
          playlistSource = `Similar Music`;
          usingOriginalRequest = false;
          originalRequest = { trackName, artistName };
        } else {
          // Fallback to original request as a last resort
          seedTrack = {
            Name: trackName,
            Artist: artistName
          };
        }
      }
    }
    
    // Set this single track as the "liked songs" for the recommendation engine
    window.recommendationEngine.likedSongs = [seedTrack];
    console.log("Set seed track as liked song:", seedTrack);
    
    // Force preprocessing to ensure all features are ready
    window.recommendationEngine.preprocessData();
    
    // Generate recommendations based on this single track
    console.log("Generating recommendations based on seed track...");
    const recommendations = window.recommendationEngine.recommendSongs(10);
    console.log(`Generated ${recommendations.length} recommendations`);
    
    if (!recommendations || recommendations.length === 0) {
      throw new Error("Could not generate recommendations. Please try a different song.");
    }
    
    // Clean and format the recommendations
    const cleanedRecommendations = recommendations.map(rec => ({
      name: rec.name || "Unknown Track",
      artist: rec.artist || "Unknown Artist",
      genre: rec.genre || "Unknown Genre",
      score: typeof rec.score === 'number' ? rec.score.toFixed(2) : rec.score || "N/A",
      id: rec.id || `local-${(rec.name || 'track').replace(/\s+/g, '-').toLowerCase()}`,
      albumCover: rec.albumCover || ''
    }));
    
    // Store the recommendations and set playlist type
    lastCsvRecommendations = cleanedRecommendations;
    
    // Use the updated playlist source in the display
    if (foundTrack) {
      currentPlaylistType = `Based on "${trackName}"`;
    } else {
      // If we used a different song as seed, indicate this in the playlist name
      currentPlaylistType = `Based on ${playlistSource}`;
    }
    
    // Display the recommendations
    renderRecommendationsTemplate("search-results", {
      recommendations: cleanedRecommendations.slice(0, 15),
      playlistType: currentPlaylistType,
      originalRequest: usingOriginalRequest ? null : originalRequest
    });
    
    // Scroll to the results
    document.getElementById('search-results').scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
    
  } catch (error) {
    console.error("Error creating playlist from track:", error);
    document.getElementById('search-results').innerHTML = 
      `<div class="error-message">Error creating playlist: ${error.message}</div>`;
  }
}

// Helper function to find a track in the dataset
function findTrackInDataset(trackName, artistName) {
  if (!window.recommendationEngine || !window.recommendationEngine.dataset) {
    return null;
  }
  
  const normalizedTrackName = normalizeString(trackName);
  const normalizedArtistName = normalizeString(artistName);
  
  // Search for the track in the dataset
  return window.recommendationEngine.dataset.find(song => {
    const songTrackName = normalizeString(song.track_name || '');
    const songArtistName = normalizeString(song.artists || '');
    
    return songTrackName === normalizedTrackName && 
           songArtistName.includes(normalizedArtistName);
  });
}

// Helper function to find ALL tracks by the same artist
function findAllArtistTracksInDataset(artistName) {
  if (!window.recommendationEngine || !window.recommendationEngine.dataset) {
    return [];
  }
  
  const normalizedArtistName = normalizeString(artistName);
  
  // Search for ALL tracks by the artist in the dataset
  const artistTracks = window.recommendationEngine.dataset.filter(song => {
    // Check if artists field exists and contains the artist name (partial match)
    if (song.artists) {
      const songArtistName = normalizeString(song.artists);
      return songArtistName.includes(normalizedArtistName);
    }
    return false;
  });
  
  console.log(`Found ${artistTracks.length} tracks by artist "${artistName}" in dataset`);
  
  // Return all found tracks
  return artistTracks;
}

// Helper function to find any track by the same artist
function findArtistTrackInDataset(artistName) {
  if (!window.recommendationEngine || !window.recommendationEngine.dataset) {
    return null;
  }
  
  const normalizedArtistName = normalizeString(artistName);
  
  // Try exact artist name first
  let artistTrack = window.recommendationEngine.dataset.find(song => {
    const songArtistName = normalizeString(song.artists || '');
    return songArtistName === normalizedArtistName;
  });
  
  // If no exact match, try partial matching (e.g. for artists with multiple names)
  if (!artistTrack) {
    artistTrack = window.recommendationEngine.dataset.find(song => {
      const songArtistName = normalizeString(song.artists || '');
      return songArtistName.includes(normalizedArtistName) || 
             normalizedArtistName.includes(songArtistName);
    });
  }
  
  // If still no match, try checking for the first name of the artist
  if (!artistTrack && normalizedArtistName.includes(' ')) {
    const artistFirstName = normalizedArtistName.split(' ')[0];
    artistTrack = window.recommendationEngine.dataset.find(song => {
      const songArtistName = normalizeString(song.artists || '');
      return songArtistName.includes(artistFirstName);
    });
  }
  
  return artistTrack;
}

// Helper function to find a popular track in the dataset to use as fallback
function findPopularTrackInDataset() {
  if (!window.recommendationEngine || !window.recommendationEngine.dataset) {
    return null;
  }
  
  // Sort by popularity and get the top track
  const sortedTracks = [...window.recommendationEngine.dataset]
    .filter(song => song.popularity && song.track_name && song.artists)
    .sort((a, b) => b.popularity - a.popularity);
  
  return sortedTracks.length > 0 ? sortedTracks[0] : null;
}

// Helper function to normalize strings for comparison
function normalizeString(str) {
  if (typeof str !== 'string') return '';
  return str.toLowerCase().trim();
}

// Update renderSearchResultsTemplate function to add the "Create Playlist" button
function renderSearchResultsTemplate(targetId, { searchResults }) {
  console.log(`Rendering ${searchResults.length} search results to ${targetId}`);
  const targetElement = document.getElementById(targetId);
  
  if (!targetElement) {
    console.error(`Target element not found: ${targetId}`);
    return;
  }
  
  // Create container
  const container = document.createElement('div');
  container.className = 'search-results-container';
  
  // Add heading
  const heading = document.createElement('h3');
  heading.textContent = 'Search Results';
  container.appendChild(heading);
  
  if (!searchResults || searchResults.length === 0) {
    const noResultsMsg = document.createElement('p');
    noResultsMsg.textContent = "No matching tracks found.";
    container.appendChild(noResultsMsg);
  } else {
    // Create results list
    const resultsList = document.createElement('div');
    resultsList.className = 'track-list';
    
    searchResults.forEach(track => {
      const trackItem = document.createElement('div');
      trackItem.className = 'track-item';
      
      // Create track info container
      const trackInfo = document.createElement('div');
      trackInfo.className = 'track-info';
      
      // Add track name
      const trackName = document.createElement('div');
      trackName.className = 'track-name';
      trackName.textContent = track.name;
      trackInfo.appendChild(trackName);
      
      // Add artist name
      const artistName = document.createElement('div');
      artistName.className = 'track-artist';
      artistName.textContent = track.artist;
      trackInfo.appendChild(artistName);
      
      // Add "Create Playlist" button
      const createPlaylistBtn = document.createElement('button');
      createPlaylistBtn.className = 'create-playlist-btn';
      createPlaylistBtn.textContent = 'Create Similar Playlist';
      createPlaylistBtn.onclick = function() {
        createPlaylistFromTrack(track.id, track.name, track.artist);
      };
      trackInfo.appendChild(createPlaylistBtn);
      
      // Add the track info to the track item
      trackItem.appendChild(trackInfo);
      
      // Create album cover if available
      if (track.albumCover) {
        const albumImg = document.createElement('img');
        albumImg.src = track.albumCover;
        albumImg.alt = `${track.name} album art`;
        albumImg.className = 'album-cover';
        trackItem.appendChild(albumImg);
      }
      
      resultsList.appendChild(trackItem);
    });
    
    container.appendChild(resultsList);
  }
  
  // Clear and append to target
  targetElement.innerHTML = '';
  targetElement.appendChild(container);
}

// Function to handle saving song-based playlist to Spotify
async function saveTrackBasedPlaylistToSpotify() {
  // Check if we have recommendations
  if (!lastCsvRecommendations || lastCsvRecommendations.length === 0) {
    alert("Please generate recommendations first");
    return;
  }
  
  try {
    console.log(`Saving ${currentPlaylistType || "Track-Based"} playlist to Spotify with ${lastCsvRecommendations.length} songs...`);
    
    const saveButton = document.querySelector('#search-results .save-spotify-btn');
    if (saveButton) {
      saveButton.textContent = "Saving...";
      saveButton.disabled = true;
    } else {
      console.warn("Save button not found in search results");
    }
    
    // Convert local recommendations to Spotify format if needed
    const trackUris = [];
    const tracksToFind = [];
    
    // Separate tracks with Spotify IDs from those that need to be searched
    // Use the displayed recommendations to create the playlist
    lastCsvRecommendations.forEach(track => {
      if (track.id && !track.id.startsWith('local-')) {
        trackUris.push(`spotify:track:${track.id}`);
      } else {
        tracksToFind.push({
          name: track.name,
          artist: track.artist
        });
      }
    });
    
    // Search for tracks that don't have IDs
    if (tracksToFind.length > 0) {
      for (const track of tracksToFind) {
        try {
          // Search Spotify for the track
          const query = `${track.name} artist:${track.artist}`;
          const searchResults = await searchSpotify(query, 'track', 1);
          
          if (searchResults && searchResults.length > 0) {
            trackUris.push(`spotify:track:${searchResults[0].id}`);
          } else {
            console.warn(`Could not find track on Spotify: ${track.name} by ${track.artist}`);
          }
        } catch (error) {
          console.error(`Error searching for track ${track.name}:`, error);
        }
      }
    }
    
    // Create a descriptive playlist name
    const playlistName = `Songs Similar to "${currentPlaylistType.replace('Based on "', '').replace('"', '')}" by Spotify Genie`;
    const result = await savePlaylistToSpotify(playlistName, trackUris);
    
    // Update UI based on result
    if (result.success) {
      // Create success message with link
      const resultsContainer = document.getElementById('search-results');
      const successMessage = document.createElement('div');
      successMessage.className = 'success-message';
      successMessage.innerHTML = `
        <p>Playlist "${result.playlistName}" with ${trackUris.length} songs saved successfully!</p>
        <a href="${result.playlistUrl}" target="_blank" class="spotify-button">
          <i class="fab fa-spotify" style="color: green;"></i> Open in Spotify
        </a>
      `;
      
      // Add success message to the container
      resultsContainer.appendChild(successMessage);
      
      // Update button
      if (saveButton) {
        saveButton.textContent = "Saved to Spotify ✓";
        saveButton.disabled = true;
      }
    } else {
      // Show error
      alert(`Failed to save playlist: ${result.error}`);
      
      // Reset button
      if (saveButton) {
        saveButton.textContent = `Save to Spotify`;
        saveButton.disabled = false;
      }
    }
  } catch (error) {
    console.error("Error saving recommendations to Spotify:", error);
    alert(`Error saving recommendations: ${error.message}`);
    
    // Reset button
    const saveButton = document.querySelector('#search-results .save-spotify-btn');
    if (saveButton) {
      saveButton.textContent = `Save to Spotify`;
      saveButton.disabled = false;
    }
  }
}

window.logoutClick = function() {
  localStorage.clear();
  console.log("Logged out successfully");
  window.location.href = redirectUrl;
};

// Add these functions to the window object for event handlers
window.handleDatasetUpload = handleDatasetUpload;
window.generateHappyRecommendations = generateHappyRecommendations;
window.handleLikedSongsUpload = handleLikedSongsUpload;
window.useSpotifyLikedSongs = useSpotifyLikedSongs;
window.generateCSVRecommendations = generateCSVRecommendations;
window.saveCSVRecommendationsToSpotify = saveCSVRecommendationsToSpotify;
// Make these functions available to inline event handlers
window.loginWithSpotifyClick = loginWithSpotifyClick;
window.logoutClick = logoutClick;
window.handleSearch = handleSearch;
window.createPlaylistFromTrack = createPlaylistFromTrack;
window.handleGeneratePlaylist = handleGeneratePlaylist;
window.exportLikedSongsToCSV = exportLikedSongsToCSV;
window.saveTrackBasedPlaylistToSpotify = saveTrackBasedPlaylistToSpotify;
