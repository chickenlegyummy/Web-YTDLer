# 🎬 Hiei's Downloader | Youtube Video/Audio Downloader Modern 

Current Version: v2.0
Last Version: v1.0 

## ✨ Features

### 🎨 Modern UI/UX
- **Glass Morphism Design**: Beautiful translucent interface with backdrop blur effects
- **Apple-inspired**: Clean, minimalist design following Apple's design principles
- **Responsive**: Works seamlessly on desktop, tablet, and mobile devices
- **Liquid Glass**: Smooth animations and modern visual effects
- **Dark Theme**: Easy on the eyes with gradient backgrounds

### ⚡ Advanced Functionality
- **Concurrent Downloads**: Handle multiple downloads simultaneously (up to 3 concurrent)
- **Real-time Progress**: Live progress bars showing current download status
- **Download Queue**: Visual queue management for multiple downloads
- **Error Prevention**: Comprehensive error handling and validation
- **Progress Phases**: Shows detailed progress for each download phase:
  - Fetching video information
  - Downloading video stream
  - Downloading audio stream  
  - Combining streams (for video downloads)
  - Processing completion

### 🎯 Download Options
- **Video Downloads**: High-quality MP4 with multiple resolution options
- **Audio Downloads**: High-quality MP3 extraction
- **Quality Selection**: Choose from available video qualities
- **Smart Combining**: Automatic video + audio stream merging using FFmpeg

### 🛡️ Robust Error Handling
- URL validation for YouTube links
- Network error recovery
- File corruption prevention
- Graceful failure handling
- Detailed error messages

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- FFmpeg (automatically handled by ffmpeg-static)

### Installation
```bash
# Clone the repository
git clone <your-repo-url>
cd Web-YTDLer

# Install dependencies
npm install

# Start the server
npm start
```

### Usage
1. Open your browser and navigate to `http://localhost:3000`
2. Paste a YouTube URL in the input field
3. Click "Fetch Video Details" to load video information
4. Select your preferred format (Video/Audio) and quality
5. Click "Start Download" and watch the real-time progress
6. Multiple downloads can be started simultaneously

## 🏗️ Architecture

### Frontend Features
- **ES6+ JavaScript**: Modern JavaScript with classes and async/await
- **Server-Sent Events**: Real-time progress updates from server
- **Responsive CSS Grid**: Modern layout system
- **CSS Custom Properties**: Dynamic theming support
- **Progressive Enhancement**: Works without JavaScript for basic functionality

### Backend Features
- **Express.js**: Fast, unopinionated web framework
- **ytdl-core**: Reliable YouTube video information extraction
- **fluent-ffmpeg**: Professional-grade video/audio processing
- **UUID**: Unique download session management
- **Stream Processing**: Memory-efficient file handling

---

**Built with ❤️ by Hiei**
