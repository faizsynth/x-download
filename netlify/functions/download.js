const axios = require('axios');
const cheerio = require('cheerio');

exports.handler = async function(event, context) {
  // Handle CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { url } = JSON.parse(event.body);
    
    if (!url) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          success: false, 
          error: 'URL is required' 
        })
      };
    }

    // Validate Twitter URL
    if (!url.includes('twitter.com') && !url.includes('x.com')) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          success: false, 
          error: 'Please enter a valid Twitter URL' 
        })
      };
    }

    console.log('Processing Twitter URL:', url);

    // Fetch the tweet page with proper headers
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 10000
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Try multiple methods to extract video URL
    let videoUrl = null;

    // Method 1: Look for video tags
    $('video').each((i, element) => {
      const src = $(element).attr('src');
      if (src && src.includes('.mp4')) {
        videoUrl = src;
        return false; // Break loop
      }
    });

    // Method 2: Look for meta tags
    if (!videoUrl) {
      videoUrl = $('meta[property="og:video"]').attr('content') || 
                 $('meta[property="og:video:url"]').attr('content');
    }

    // Method 3: Look for JSON data in script tags
    if (!videoUrl) {
      const scriptTags = $('script');
      for (let i = 0; i < scriptTags.length; i++) {
        const scriptContent = $(scriptTags[i]).html();
        if (scriptContent && scriptContent.includes('video_url')) {
          // Try to find video URL in JSON
          const videoMatch = scriptContent.match(/"video_url":"([^"]+)"/);
          if (videoMatch) {
            videoUrl = videoMatch[1].replace(/\\u0026/g, '&');
            break;
          }
          
          // Try another pattern
          const urlMatch = scriptContent.match(/"url":"([^"]+\.mp4[^"]*)"/);
          if (urlMatch) {
            videoUrl = urlMatch[1].replace(/\\u0026/g, '&');
            break;
          }
        }
      }
    }

    if (videoUrl) {
      console.log('Found video URL:', videoUrl);
      
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          success: true,
          videoUrl: videoUrl,
          downloadUrl: videoUrl, // Direct download
          message: 'Video found successfully!'
        })
      };
    } else {
      return {
        statusCode: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          success: false,
          error: 'No video found in this tweet. Make sure it contains a video and is publicly accessible.'
        })
      };
    }

  } catch (error) {
    console.error('Error:', error.message);
    
    let errorMessage = 'Failed to fetch video. Please try again.';
    
    if (error.response) {
      if (error.response.status === 404) {
        errorMessage = 'Tweet not found. Please check the URL.';
      } else if (error.response.status === 403) {
        errorMessage = 'Access denied. The tweet might be private or restricted.';
      }
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = 'Request timeout. Please try again.';
    }
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        error: errorMessage
      })
    };
  }
};
