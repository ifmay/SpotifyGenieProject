/**
 * Recommendation Engine for Spotify Genie
 * Adapted from the Python implementation to JavaScript
 */

// Class for handling recommendations from CSV data
class RecommendationEngine {
    constructor() {
      this.dataset = null;
      this.likedSongs = null;
      this.features = ['popularity', 'danceability', 'energy', 'acousticness', 'valence', 'tempo'];
      this.featuresMeans = {};
      this.featuresStdDevs = {};
      console.log("RecommendationEngine initialized");
    }
  
   /**
 * FIXED methods for RecommendationEngine class
 * Replace these methods in recommendation-engine.js
 */

// Fixed loadDataset method - supports both file paths and direct data
async loadDataset(fileOrData) {
    try {
      // If fileOrData is already an array, it's direct data
      if (Array.isArray(fileOrData)) {
        console.log(`Using directly provided dataset with ${fileOrData.length} songs`);
        this.dataset = fileOrData;
        this.preprocessData();
        return this.dataset;
      }
      
      // Otherwise, try to load from file
      let csvData;
      try {
        csvData = await window.fs.readFile(fileOrData, { encoding: 'utf8' });
      } catch (error) {
        console.error("Error reading file, using localStorage as fallback:", error);
        // Try to get from localStorage as fallback
        csvData = localStorage.getItem('spotify_genie_dataset');
        if (!csvData) {
          throw new Error("Could not load dataset from file or localStorage");
        }
      }
      
      return new Promise((resolve, reject) => {
        Papa.parse(csvData, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results) => {
            console.log(`Loaded dataset with ${results.data.length} songs`);
            this.dataset = results.data;
            // Preprocess the dataset
            this.preprocessData();
            resolve(this.dataset);
          },
          error: (error) => {
            console.error("Error parsing dataset CSV:", error);
            reject(error);
          }
        });
      });
    } catch (error) {
      console.error("Error reading dataset file:", error);
      throw error;
    }
  }
  
  // Fixed loadLikedSongs method - supports both file paths and direct data
  async loadLikedSongs(source) {
    if (typeof source === 'string') {
      // Source is a file path
      try {
        let csvData;
        try {
          csvData = await window.fs.readFile(source, { encoding: 'utf8' });
        } catch (error) {
          console.error("Error reading file, using localStorage as fallback:", error);
          // Try to get from localStorage as fallback
          csvData = localStorage.getItem('spotify_genie_liked_songs');
          if (!csvData) {
            throw new Error("Could not load liked songs from file or localStorage");
          }
        }
        
        return new Promise((resolve, reject) => {
          Papa.parse(csvData, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: (results) => {
              console.log(`Loaded ${results.data.length} liked songs from CSV`);
              this.likedSongs = results.data;
              resolve(this.likedSongs);
            },
            error: (error) => {
              console.error("Error parsing liked songs CSV:", error);
              reject(error);
            }
          });
        });
      } catch (error) {
        console.error("Error reading liked songs file:", error);
        throw error;
      }
    } else if (Array.isArray(source)) {
      // Source is an array of tracks
      this.likedSongs = source;
      console.log(`Loaded ${this.likedSongs.length} liked songs from array`);
      return this.likedSongs;
    } else {
      throw new Error("Invalid source for liked songs");
    }
  }
  
    // Helper function to safely convert values to lowercase strings
    safeToLowerCase(value) {
      if (typeof value === 'string') {
        return value.toLowerCase();
      } else if (value === null || value === undefined) {
        return '';
      } else {
        // Convert to string first
        return String(value).toLowerCase();
      }
    }

    // Preprocess the dataset (standardize features)
    preprocessData() {
      if (!this.dataset || this.dataset.length === 0) {
        throw new Error("Dataset not loaded");
      }
  
      // Calculate mean and std dev for each feature
      this.features.forEach(feature => {
        const values = this.dataset
          .map(song => song[feature])
          .filter(value => typeof value === 'number' && !isNaN(value));
        
        if (values.length === 0) {
          console.warn(`Feature ${feature} not found in dataset or has no valid values`);
          return;
        }
  
        // Calculate mean
        const sum = values.reduce((acc, val) => acc + val, 0);
        const mean = sum / values.length;
        this.featuresMeans[feature] = mean;
  
        // Calculate standard deviation
        const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
        const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / values.length;
        const stdDev = Math.sqrt(variance);
        this.featuresStdDevs[feature] = stdDev;
  
        // Standardize the feature in the dataset
        this.dataset.forEach(song => {
          if (typeof song[feature] === 'number' && !isNaN(song[feature])) {
            song[`${feature}_standardized`] = (song[feature] - mean) / stdDev;
          } else {
            song[`${feature}_standardized`] = 0; // Default value for missing data
          }
        });
      });
  
      console.log("Dataset preprocessing completed");
    }
  
    // Get user's preferred genres from liked songs
    getUserGenres() {
      if (!this.dataset || !this.likedSongs) {
        throw new Error("Dataset or liked songs not loaded");
      }
  
      const userGenres = new Set();
      
      this.likedSongs.forEach(likedSong => {
        if (!likedSong.Name) return;
        
        // Case insensitive matching - FIXED to handle non-string values
        const songName = this.safeToLowerCase(likedSong.Name);
        const artistName = likedSong.Artist ? this.safeToLowerCase(likedSong.Artist) : '';
        
        // Find matching songs in dataset
        const matches = this.dataset.filter(song => {
          const datasetSongName = this.safeToLowerCase(song.track_name || '');
          const datasetArtistName = this.safeToLowerCase(song.artists || '');
          
          if (artistName) {
            // Match both name and artist
            return datasetSongName === songName && datasetArtistName.includes(artistName);
          } else {
            // Match only by name
            return datasetSongName === songName;
          }
        });
        
        // Add genres from matched songs
        matches.forEach(match => {
          if (match.track_genre) {
            userGenres.add(match.track_genre);
            console.log(`Found genre match: '${likedSong.Name}' by ${likedSong.Artist || 'Unknown'} → ${match.track_genre}`);
          }
        });
      });
      
      return Array.from(userGenres);
    }
  
    // Calculate cosine similarity between two vectors
    calculateCosineSimilarity(vectorA, vectorB) {
      // Calculate dot product
      let dotProduct = 0;
      let normA = 0;
      let normB = 0;
      
      for (let i = 0; i < vectorA.length; i++) {
        dotProduct += vectorA[i] * vectorB[i];
        normA += vectorA[i] * vectorA[i];
        normB += vectorB[i] * vectorB[i];
      }
      
      if (normA === 0 || normB === 0) return 0;
      
      return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
  
    // Recommend songs based on liked songs
    recommendSongs(topN = 20) {
      if (!this.dataset || !this.likedSongs) {
        throw new Error("Dataset or liked songs not loaded");
      }
  
      // Get user's preferred genres
      const userGenres = this.getUserGenres();
      console.log("User's preferred genres:", userGenres);
      
      // Filter dataset by genres if we found any
      let filteredDataset = this.dataset;
      if (userGenres.length > 0) {
        filteredDataset = this.dataset.filter(song => 
          userGenres.includes(song.track_genre)
        );
        console.log(`Filtered dataset to ${filteredDataset.length} songs in user's preferred genres`);
      } else {
        console.log("No genre information found for liked songs. Using all genres.");
      }
      
      // Exclude songs user already likes
      const likedTitles = this.likedSongs.map(song => this.safeToLowerCase(song.Name));
      filteredDataset = filteredDataset.filter(song => 
        !likedTitles.includes(this.safeToLowerCase(song.track_name || ''))
      );
      console.log(`Excluded ${likedTitles.length} liked songs from recommendations`);
      
      // Calculate recommendations for each liked song
      let allRecommendations = [];
      
      this.likedSongs.forEach(likedSong => {
        if (!likedSong.Name) return;
        
        // Find this song in the dataset
        const songName = this.safeToLowerCase(likedSong.Name);
        const artistName = likedSong.Artist ? this.safeToLowerCase(likedSong.Artist) : '';
        
        const matchedSongs = this.dataset.filter(song => {
          const datasetSongName = this.safeToLowerCase(song.track_name || '');
          const datasetArtistName = this.safeToLowerCase(song.artists || '');
          
          if (artistName) {
            return datasetSongName === songName && datasetArtistName.includes(artistName);
          } else {
            return datasetSongName === songName;
          }
        });
        
        if (matchedSongs.length === 0) {
          console.log(`Warning: Could not find '${likedSong.Name}' by ${likedSong.Artist || 'Unknown'} in the dataset`);
          return;
        }
        
        // Use the first matched song as reference
        const likedSongData = matchedSongs[0];
        
        // Calculate similarity for each song in filtered dataset
        filteredDataset.forEach(song => {
          // Create feature vectors (using standardized values)
          const likedSongVector = [];
          const candidateSongVector = [];
          
          this.features.forEach(feature => {
            likedSongVector.push(likedSongData[`${feature}_standardized`] || 0);
            candidateSongVector.push(song[`${feature}_standardized`] || 0);
          });
          
          // Calculate similarity
          const similarity = this.calculateCosineSimilarity(likedSongVector, candidateSongVector);
          
          // Add genre bonus (0.2 for exact genre match)
          let genreBonus = 0;
          if (likedSongData.track_genre && song.track_genre && likedSongData.track_genre === song.track_genre) {
            genreBonus = 0.1;
          }
          
          // Add to recommendations with final score
          allRecommendations.push({
            ...song,
            similarity: similarity,
            genre_bonus: genreBonus,
            final_score: similarity + genreBonus,
            source_song: likedSong.Name
          });
        });
      });
      
      // Remove duplicates (keep highest score)
      const seen = new Set();
      const uniqueRecommendations = [];
      
      allRecommendations
        .sort((a, b) => b.final_score - a.final_score)
        .forEach(rec => {
          if (!seen.has(rec.track_name)) {
            seen.add(rec.track_name);
            uniqueRecommendations.push(rec);
          }
        });
      
      // Get top N recommendations
      const finalRecommendations = uniqueRecommendations.slice(0, topN);
      
      // Format for display
      return finalRecommendations.map(rec => ({
        name: rec.track_name,
        artist: rec.artists,
        genre: rec.track_genre,
        score: rec.final_score.toFixed(2),
        id: rec.id || `local-${this.safeToLowerCase(String(rec.track_name)).replace(/\s+/g, '-')}`,
        albumCover: rec.album_cover || '' // You may need to adjust this based on your dataset
      }));
    }
  }
  
  // Make the RecommendationEngine available globally
  window.RecommendationEngine = RecommendationEngine;
  console.log("RecommendationEngine loaded and available globally");