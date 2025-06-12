import axios from "axios";

// Authentication configuration
const clientId = 'fb6eea506c354ff292e0898ffa737638';
const redirectUrl = 'https://spotifygenie-96268.web.app/';
const authorizationEndpoint = "https://accounts.spotify.com/authorize";
const tokenEndpoint = "https://accounts.spotify.com/api/token";
const scope = 'user-read-private user-read-email user-library-read user-top-read user-read-recently-played playlist-modify-private playlist-read-private';

// Helper functions for authentication
const authHelpers = {
  getCookie: function() {
    const name = "token=";
    const decodedCookie = decodeURIComponent(document.cookie);
    const cookieArray = decodedCookie.split(';');
    
    for (let i = 0; i < cookieArray.length; i++) {
      let cookie = cookieArray[i].trim();
      if (cookie.indexOf(name) === 0) {
        return cookie.substring(name.length, cookie.length);
      }
    }
    return "";
  },
  
  getUserID: function() {
    return localStorage.getItem("userID") || "";
  },
  
  getUsername: function() {
    return localStorage.getItem("username") || "";
  },
  
  initiateLogin: function() {
    // Create and store a random "state" value
    const state = generateRandomString(16);
    localStorage.setItem("pkce_state", state);
    
    // Create the authorization URL
    const authUrl = new URL(authorizationEndpoint);
    const params = {
      response_type: 'code',
      client_id: clientId,
      scope: scope,
      redirect_uri: redirectUrl,
      state: state
    };
    
    authUrl.search = new URLSearchParams(params).toString();
    window.location.href = authUrl.toString();
  },
  
  exchangeToken: async function(code) {
    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", redirectUrl);
    
    try {
      const response = await axios.post(tokenEndpoint, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      const expiresIn = response.data.expires_in;
      const accessToken = response.data.access_token;
      
      // Set the token in a cookie with expiration
      const d = new Date();
      d.setTime(d.getTime() + expiresIn * 1000);
      document.cookie = `token=${accessToken};expires=${d.toUTCString()};path=/;samesite=lax;Secure`;
      
      // Get and store user profile information
      this.fetchUserProfile(accessToken);
      
      return accessToken;
    } catch (error) {
      console.error("Error exchanging token:", error);
      return null;
    }
  },
  
  fetchUserProfile: async function(token) {
    try {
      const response = await axios({
        method: "GET",
        url: "https://api.spotify.com/v1/me",
        headers: {
          Authorization: "Bearer " + token
        }
      });
      
      localStorage.setItem("userID", response.data.id);
      localStorage.setItem("username", response.data.display_name);
      
      return response.data;
    } catch (error) {
      console.error("Error fetching user profile:", error);
      return null;
    }
  }
};

// Utility function to generate random string for state parameter
function generateRandomString(length) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  
  return text;
}

// Main Spotify API helper functions
const spotifyHelpers = {
  // Search functions
  searchArtist: async function(val) {
    const token = authHelpers.getCookie();
    try {
      const response = await axios({
        method: "GET",
        url: `https://api.spotify.com/v1/search?q=${encodeURIComponent(val)}&type=artist&limit=18`,
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/x-www-form-urlencoded"
        }
      });
      
      return response.data.artists.items;
    } catch (error) {
      console.error("Error searching artists:", error);
      return [];
    }
  },
  
  searchTrack: async function(val) {
    const token = authHelpers.getCookie();
    try {
      const response = await axios({
        method: "GET",
        url: `https://api.spotify.com/v1/search?q=${encodeURIComponent(val)}&type=track&limit=24`,
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/x-www-form-urlencoded"
        }
      });
      
      return response.data.tracks.items;
    } catch (error) {
      console.error("Error searching tracks:", error);
      return [];
    }
  },
  
  // User top items functions
  getUserTopTracks: async function(range = "medium_term") {
    const token = authHelpers.getCookie();
    try {
      const response = await axios({
        method: "GET",
        url: `https://api.spotify.com/v1/me/top/tracks?limit=5&time_range=${range}`,
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/x-www-form-urlencoded"
        }
      });
      
      return [response.data];
    } catch (error) {
      console.error("Error getting user top tracks:", error);
      return [];
    }
  },
  
  getUserTopArtists: async function(range = "medium_term") {
    const token = authHelpers.getCookie();
    try {
      const response = await axios({
        method: "GET",
        url: `https://api.spotify.com/v1/me/top/artists?limit=5&time_range=${range}`,
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/x-www-form-urlencoded"
        }
      });
      
      return [response.data];
    } catch (error) {
      console.error("Error getting user top artists:", error);
      return [];
    }
  },
  
  // Seed extraction functions
  getTrackSeed: async function(res) {
    const trackSeed = [];
    if (res && res[0] && res[0].items) {
      res[0].items.forEach((e) => {
        trackSeed.push(e.id);
      });
    }
    return trackSeed;
  },
  
  getArtistSeed: async function(res) {
    const artistSeed = [];
    if (res && res[0] && res[0].items) {
      res[0].items.forEach((e) => {
        artistSeed.push(e.id);
      });
    }
    return artistSeed;
  },
  
  // Recommendation functions
  getbyTracksWithSeed: async function(trackSeed) {
    const token = authHelpers.getCookie();
    try {
      const response = await axios({
        method: "GET",
        url: `https://api.spotify.com/v1/recommendations?limit=100&seed_tracks=${trackSeed.join(',')}`,
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/x-www-form-urlencoded"
        }
      });
      
      return [response.data];
    } catch (error) {
      console.error("Error getting recommendations by tracks:", error);
      return [];
    }
  },
  
  getbyArtistsWithSeed: async function(artistSeed) {
    const token = authHelpers.getCookie();
    try {
      const response = await axios({
        method: "GET",
        url: `https://api.spotify.com/v1/recommendations?limit=100&seed_artists=${artistSeed.join(',')}`,
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/x-www-form-urlencoded"
        }
      });
      
      return [response.data];
    } catch (error) {
      console.error("Error getting recommendations by artists:", error);
      return [];
    }
  },
  
  // Data processing functions
  databySelectedTracks: async function(tracks) {
    const data = await this.getbyTracksWithSeed(tracks);
    document.cookie = "selection=;max-age=0;samesite=lax;Secure";
    await this.formattedDatabyTracks(data);
  },
  
  databySelectedArtists: async function(artists) {
    const data = await this.getbyArtistsWithSeed(artists);
    document.cookie = "selection=;max-age=0;samesite=lax;Secure";
    await this.formattedDatabyArtists(data);
  },
  
  databyAllTimeTopTracks: async function(range) {
    const tracks = await this.getUserTopTracks(range);
    const seed = await this.getTrackSeed(tracks);
    const data = await this.getbyTracksWithSeed(seed);
    await this.formattedDatabyTracks(data);
  },
  
  databyAllTimeTopArtists: async function(range) {
    const artists = await this.getUserTopArtists(range);
    const seed = await this.getArtistSeed(artists);
    const data = await this.getbyArtistsWithSeed(seed);
    await this.formattedDatabyArtists(data);
  },
  
  formattedDatabyTracks: async function(data) {
    if (data && data[0]) {
      const result = {
        seeds: data[0].seeds,
        tracks: data[0].tracks,
      };
      localStorage.setItem("spotiData", JSON.stringify(result));
      window.location.reload();
    }
  },
  
  formattedDatabyArtists: async function(data) {
    if (data && data[0]) {
      const result = {
        seeds: data[0].seeds,
        tracks: data[0].tracks,
      };
      localStorage.setItem("spotiData", JSON.stringify(result));
      window.location.reload();
    }
  },
  
  // Playlist creation functions
  createPlaylist: async function() {
    const token = authHelpers.getCookie();
    const uid = authHelpers.getUserID();
    const uname = authHelpers.getUsername();
    
    let playlistName = "";
    if (uname) {
      playlistName = `created for ${uname}, by Spotify Genie`;
    } else {
      playlistName = `created for ${uid}, by Spotify Genie`;
    }
    
    try {
      const response = await axios({
        method: "POST",
        url: `https://api.spotify.com/v1/users/${uid}/playlists`,
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json"
        },
        data: {
          name: playlistName,
          public: false,
        }
      });
      
      const playlistId = response.data.id;
      await this.populatePlaylist(playlistId);
      window.open(`https://open.spotify.com/playlist/${playlistId}`, "_blank");
      
      return playlistId;
    } catch (error) {
      console.error("Error creating playlist:", error);
      return null;
    }
  },
  
  populatePlaylist: async function(playlistId) {
    const token = authHelpers.getCookie();
    const spotiData = JSON.parse(localStorage.getItem("spotiData"));
    
    if (!spotiData || !spotiData.tracks) {
      console.error("No tracks data available");
      return null;
    }
    
    const trackUris = spotiData.tracks.map(track => track.uri);
    
    try {
      const response = await axios({
        method: "POST",
        url: `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json"
        },
        data: {
          uris: trackUris,
          position: 0,
        }
      });
      
      return response.data.snapshot_id;
    } catch (error) {
      console.error("Error populating playlist:", error);
      return null;
    }
  }
};

// Export both helper objects
export { spotifyHelpers as default, authHelpers };