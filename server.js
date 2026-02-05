import express from "express";
import cors from "cors";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 5000;
const DOWNLOAD_DIR = path.resolve("./downloads");

// Create downloads directory
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

// Clean old files periodically (older than 1 hour)
setInterval(() => {
  const now = Date.now();
  const files = fs.readdirSync(DOWNLOAD_DIR);
  
  files.forEach(file => {
    const filePath = path.join(DOWNLOAD_DIR, file);
    const stats = fs.statSync(filePath);
    const age = now - stats.mtime.getTime();
    
    // Delete files older than 1 hour
    if (age > 60 * 60 * 1000) {
      fs.unlinkSync(filePath);
      console.log(`ðŸ—‘ï¸  Deleted old file: ${file}`);
    }
  });
}, 30 * 60 * 1000); // Run every 30 minutes

// Check if yt-dlp is installed
async function checkYtDlp() {
  try {
    await execAsync('yt-dlp --version');
    console.log('âœ… yt-dlp is installed');
    return true;
  } catch (error) {
    console.log('âŒ yt-dlp not found. Installing...');
    try {
      // Try to install yt-dlp
      await execAsync('pip3 install yt-dlp --break-system-packages');
      console.log('âœ… yt-dlp installed successfully');
      return true;
    } catch (installError) {
      console.log('âš ï¸  Could not install yt-dlp automatically');
      console.log('Please install manually: pip3 install yt-dlp');
      return false;
    }
  }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Get video info
app.post('/api/info', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL required' });
  }

  try {
    const command = `yt-dlp --dump-json "${url}"`;
    const { stdout } = await execAsync(command);
    const info = JSON.parse(stdout);

    res.json({
      success: true,
      title: info.title,
      duration: info.duration,
      thumbnail: info.thumbnail,
      formats: info.formats?.length || 0
    });
  } catch (error) {
    console.error('Info Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get video info' 
    });
  }
});

// Download endpoint
app.post('/api/download', async (req, res) => {
  const { url, type, quality } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL required' });
  }

  console.log(`ðŸ“¥ Download request: ${url} (${type})`);

  const timestamp = Date.now();
  const filename = `video_${timestamp}`;
  const outputTemplate = path.join(DOWNLOAD_DIR, `${filename}.%(ext)s`);

  let format = '';
  
  if (type === 'audio') {
    format = '-x --audio-format mp3 --audio-quality 0';
  } else {
    // Video download with quality
    const videoQuality = quality || '1080';
    format = `-f "bestvideo[height<=${videoQuality}]+bestaudio/best[height<=${videoQuality}]" --merge-output-format mp4`;
  }

  const command = `yt-dlp ${format} -o "${outputTemplate}" "${url}"`;

  try {
    console.log(`ðŸ”„ Executing: ${command}`);
    
    // Execute download
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });

    console.log('âœ… Download completed');

    // Find the downloaded file
    const files = fs.readdirSync(DOWNLOAD_DIR);
    const downloadedFile = files.find(f => f.startsWith(filename));

    if (!downloadedFile) {
      throw new Error('Downloaded file not found');
    }

    const filePath = path.join(DOWNLOAD_DIR, downloadedFile);

    // Send file to client
    res.download(filePath, downloadedFile, (err) => {
      if (err) {
        console.error('Download send error:', err);
      }
      
      // Delete file after sending
      try {
        fs.unlinkSync(filePath);
        console.log(`ðŸ—‘ï¸  Deleted: ${downloadedFile}`);
      } catch (deleteErr) {
        console.error('Delete error:', deleteErr);
      }
    });

  } catch (error) {
    console.error('Download error:', error);
    
    // Clean up any partial downloads
    const files = fs.readdirSync(DOWNLOAD_DIR);
    files.forEach(file => {
      if (file.startsWith(filename)) {
        try {
          fs.unlinkSync(path.join(DOWNLOAD_DIR, file));
        } catch (e) {}
      }
    });

    res.status(500).json({ 
      error: 'Download failed',
      message: error.message 
    });
  }
});

// Supported platforms check
app.get('/api/platforms', (req, res) => {
  res.json({
    supported: [
      'YouTube',
      'Instagram', 
      'Facebook',
      'TikTok',
      'Twitter',
      'Reddit',
      'Vimeo',
      'Dailymotion',
      '1000+ more sites'
    ],
    message: 'yt-dlp supports 1000+ websites'
  });
});

// Start server
(async () => {
  const ytdlpAvailable = await checkYtDlp();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`
â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
â•‘                                                           â•‘
â•‘     ðŸ” SUBHASHCYBERSECURITY VIDEO DOWNLOADER ðŸ”          â•‘
â•‘                                                           â•‘
â•‘     Server Status: ACTIVE âœ…                             â•‘
â•‘     Port: ${PORT}                                        â•‘
â•‘     yt-dlp: ${ytdlpAvailable ? 'Available âœ…' : 'Not Found âŒ'}                              â•‘
â•‘                                                           â•‘
â•‘     Supports 1000+ websites including:                   â•‘
â•‘     â€¢ YouTube (Videos + Shorts)                          â•‘
â•‘     â€¢ Instagram (Posts + Reels + Stories)                â•‘
â•‘     â€¢ Facebook â€¢ TikTok â€¢ Twitter â€¢ Reddit               â•‘
â•‘     â€¢ And many more...                                   â•‘
â•‘                                                           â•‘
â•‘     Access: http://localhost:${PORT}                     â•‘
â•‘                                                           â•‘
â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    `);
    
    if (!ytdlpAvailable) {
      console.log('âš ï¸  Install yt-dlp manually:');
      console.log('   pip3 install yt-dlp');
      console.log('   or: brew install yt-dlp (Mac)');
      console.log('   or: apt install yt-dlp (Linux)');
    }
  });
})();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  process.exit(0);
});
