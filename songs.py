import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import StandardScaler

# Load the user's liked songs
def load_liked_songs(file_path):
    liked_songs = pd.read_csv(file_path)
    # Ensure we have columns for both name and artist
    if 'Name' not in liked_songs.columns or 'Artist' not in liked_songs.columns:
        print("Warning: liked_songs.csv should have 'Name' and 'Artist' columns")
    return liked_songs

# Load the dataset of available songs
def load_dataset(file_path):
    dataset = pd.read_csv(file_path)
    return dataset

# Preprocess the dataset for recommendations
def preprocess_data(dataset):
    features = ['popularity', 'danceability', 'energy', 'acousticness', 'valence', 'tempo']
    scaler = StandardScaler()
    dataset[features] = scaler.fit_transform(dataset[features])
    return dataset, features

# Get user's preferred genres from liked songs
def get_user_genres(liked_songs, dataset):
    # Map liked songs to their genres in the dataset
    user_genres = set()
    
    for _, liked_song in liked_songs.iterrows():
        # Match by both track name and artist
        if 'Artist' in liked_songs.columns:
            # Find songs that match both name and artist (case insensitive)
            matches = dataset[(dataset['track_name'].str.lower() == liked_song['Name'].lower()) & 
                              (dataset['artists'].str.lower().str.contains(liked_song['Artist'].lower()))]
        else:
            # Fallback to just matching by name if no artist column
            matches = dataset[dataset['track_name'].str.lower() == liked_song['Name'].lower()]
        
        if not matches.empty:
            # Add genres from matched songs
            for _, match in matches.iterrows():
                user_genres.add(match['track_genre'])
                print(f"Found genre match: '{liked_song['Name']}' by {liked_song.get('Artist', 'Unknown')} → {match['track_genre']}")
    
    return list(user_genres)

# Recommend songs based on cosine similarity with genre filtering
def recommend_songs(liked_songs, dataset, features, top_n=10):
    all_recommendations = pd.DataFrame()
    
    # Get user's preferred genres
    user_genres = get_user_genres(liked_songs, dataset)
    
    # If no genres found, use all genres (fallback)
    if not user_genres:
        print("No genre information found for liked songs. Using all genres.")
        filtered_dataset = dataset.copy()
    else:
        print(f"Recommending songs from these genres: {', '.join(user_genres)}")
        # Filter dataset to only include songs from user's preferred genres
        filtered_dataset = dataset[dataset['track_genre'].isin(user_genres)].copy()
    
    # Exclude songs user already likes - ensure we filter by track name regardless of case
    liked_titles = [name.lower() for name in liked_songs['Name']]
    filtered_dataset = filtered_dataset[~filtered_dataset['track_name'].str.lower().isin(liked_titles)].copy()
    
    print(f"Filtered out {len(liked_titles)} song titles from your liked songs list")
    
    for _, liked_song in liked_songs.iterrows():
        # Check if the liked song exists in the dataset - match by both name and artist
        if 'Artist' in liked_songs.columns:
            matched_songs = dataset[(dataset['track_name'].str.lower() == liked_song['Name'].lower()) & 
                                    (dataset['artists'].str.lower().str.contains(liked_song['Artist'].lower()))]
        else:
            matched_songs = dataset[dataset['track_name'].str.lower() == liked_song['Name'].lower()]
        
        liked_song_vector = matched_songs[features]
        if liked_song_vector.empty:
            print(f"Warning: Could not find '{liked_song['Name']}' by {liked_song.get('Artist', 'Unknown')} in the dataset")
            continue
        
        # Compute similarity
        similarity = cosine_similarity(liked_song_vector, filtered_dataset[features])
        
        # Create temp dataframe with similarities
        temp_df = filtered_dataset.copy()
        temp_df.loc[:, 'similarity'] = similarity[0]
        
        # Add genre match score (0.2 bonus for exact genre match)
        liked_song_genres = matched_songs['track_genre'].values
        if len(liked_song_genres) > 0:
            exact_genre = liked_song_genres[0]
            temp_df.loc[:, 'genre_bonus'] = temp_df['track_genre'].apply(lambda x: 0.2 if x == exact_genre else 0)
            temp_df.loc[:, 'final_score'] = temp_df['similarity'] + temp_df['genre_bonus']
        else:
            temp_df.loc[:, 'final_score'] = temp_df['similarity']
        
        # Get top recommendations for this liked song
        top_recommendations = temp_df.nlargest(top_n, 'final_score')
        
        # Append to overall recommendations
        all_recommendations = pd.concat([all_recommendations, top_recommendations])
    
    # Remove duplicates and get overall top recommendations
    final_recommendations = all_recommendations.drop_duplicates(subset=['track_name']).nlargest(top_n, 'final_score')
    
    return final_recommendations

# Main function
def main():
    liked_songs_file = 'liked_songs.csv'
    dataset_file = 'dataset.csv'
    
    # Load data
    liked_songs = load_liked_songs(liked_songs_file)
    dataset = load_dataset(dataset_file)
    
    # Preprocess data
    dataset, features = preprocess_data(dataset)
    
    # Generate recommendations
    recommendations = recommend_songs(liked_songs, dataset, features)
    
    if recommendations.empty:
        print("No recommendations found. Check if your liked songs exist in the dataset.")
    else:
        # Save or display the recommendations
        print("\nRecommended Songs:")
        
        # Set display options to show full content
        pd.set_option('display.max_columns', None)
        pd.set_option('display.width', 1000)
        pd.set_option('display.max_colwidth', 100)
        
        # Format the output
        formatted_recommendations = recommendations[['track_name', 'artists', 'track_genre', 'similarity', 'final_score']].sort_values(by='final_score', ascending=False)
        print(formatted_recommendations)

if __name__ == "__main__":
    main()