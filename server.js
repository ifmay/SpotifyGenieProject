app.post('/save-liked-songs', (req, res) => {
    console.log("Received request to save liked songs...");
    console.log("Request Body:", req.body); // Debugging output

    const { tracks } = req.body;

    if (!tracks || tracks.length === 0) {
        console.error("No tracks received.");
        return res.status(400).json({ success: false, message: "No tracks received" });
    }

    // Format CSV content
    let csvContent = "Name,Artist\n";
    tracks.forEach(track => {
        csvContent += `"${track.name}","${track.artist}"\n`;
    });

    // Save to project directory
    fs.writeFile('liked_songs.csv', csvContent, (err) => {
        if (err) {
            console.error("Error writing file:", err);
            return res.status(500).json({ success: false });
        }
        console.log("Liked songs saved successfully!");
        res.json({ success: true });
    });
});
