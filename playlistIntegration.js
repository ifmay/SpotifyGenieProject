// Integration script to connect the playlist creator with your existing app

// Wait for DOM content to be loaded
document.addEventListener('DOMContentLoaded', function() {
    // Add a button to the main UI to access the playlist creator
    function addPlaylistCreatorButton() {
      // Check if the user is logged in
      if (localStorage.getItem('access_token')) {
        // Create a button container
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'component-container';
        buttonContainer.style.textAlign = 'center';
        
        // Create the button
        const button = document.createElement('button');
        button.textContent = 'Open Advanced Playlist Creator';
        button.addEventListener('click', initPlaylistCreator);
        
        // Add button to container
        buttonContainer.appendChild(button);
        
        // Add container to the body
        document.body.appendChild(buttonContainer);
      }
    }
    
    // Function to initialize the playlist creator
    function initPlaylistCreator() {
      // Initialize the playlist creator component
      playlistCreator.init();
      
      // Scroll to the playlist creator container
      document.getElementById('playlist-creator-container').scrollIntoView({ behavior: 'smooth' });
    }
    
    // Add a dedicated section to display created playlists
    function addCreatedPlaylistsSection() {
      // Check if the user is logged in
      if (localStorage.getItem('access_token')) {
        // Create a container for created playlists
        const container = document.createElement('div');
        container.id = 'created-playlists-container';
        container.className = 'component-container';
        
        // Set the container content
        container.innerHTML = `
          <h3>Your Created Playlists</h3>
          <div id="created-playlists-list">
            <p>Your created playlists will appear here.</p>
          </div>
          <button id="refresh-playlists-btn">Refresh Playlists</button>
        `;
        
        // Add container to the body
        document.body.appendChild(container);
        
        // Add event listener to the refresh button
        document.getElementById('refresh-playlists-btn').addEventListener('click', displayCreatedPlaylists);
        
        // Display created playlists initially
        displayCreatedPlaylists();
      }
    }
    
    // Function to display created playlists from localStorage
    function displayCreatedPlaylists() {
      const container = document.getElementById('created-playlists-list');
      const spotiData = localStorage.getItem('spotiData');
      
      if (spotiData) {
        try {
          const data = JSON.parse(spotiData);
          const tracks = data.tracks;
          
          if (tracks && tracks.length > 0) {
            container.innerHTML = '<div class="playlist-tracks"></div>';
            const tracksList = container.querySelector('.playlist-tracks');
            
            // Display the tracks
            tracks.slice(0, 10).forEach(track => {
              const trackItem = document.createElement('div');
              trackItem.className = 'track-item';
              
              // Get the track image
              const trackImg = track.album && track.album.images && track.album.images.length > 0 
                ? `<img src="${track.album.images[0].url}" alt="${track.name}" class="album-cover">` 
                : '';
              
              // Get artist names
              const artistNames = track.artists.map(artist => artist.name).join(', ');
              
              trackItem.innerHTML = `
                <div class="track-info">
                  <div class="track-name">${track.name}</div>
                  <div class="track-artist">${artistNames}</div>
                </div>
                ${trackImg}
              `;
              
              tracksList.appendChild(trackItem);
            });
            
            // Add a button to create a Spotify playlist
            const createButton = document.createElement('button');
            createButton.textContent = 'Save Playlist to Spotify';
            createButton.className = 'action-btn';
            createButton.style.marginTop = '15px';
            createButton.addEventListener('click', function() {
              spotifyHelpers.createPlaylist()
                .then(() => {
                  alert('Playlist saved to your Spotify account!');
                })
                .catch(error => {
                  console.error('Error saving playlist:', error);
                  alert(`Error saving playlist: ${error.message}`);
                });
            });
            
            container.appendChild(createButton);
          } else {
            container.innerHTML = '<p>No playlist data found. Create a playlist first!</p>';
          }
        } catch (error) {
          console.error('Error parsing playlist data:', error);
          container.innerHTML = `<p>Error loading playlist data: ${error.message}</p>`;
        }
      } else {
        container.innerHTML = '<p>No playlist data found. Create a playlist first!</p>';
      }
    }
    
    // Function to extend the existing app with our new features
    function extendApp() {
      // Add event listener for page load
      if (window.initApp) {
        // Store the original initApp function
        const originalInitApp = window.initApp;
        
        // Override the initApp function
        window.initApp = async function() {
          // Call the original function
          await originalInitApp();
          
          // Add our extensions
          addPlaylistCreatorButton();
          addCreatedPlaylistsSection();
        };
      } else {
        // If initApp doesn't exist, just add our extensions
        addPlaylistCreatorButton();
        addCreatedPlaylistsSection();
      }
      
      // Add global access to the playlist creator
      window.playlistCreator = playlistCreator;
    }
    
    // Call the extension function
    extendApp();
  });