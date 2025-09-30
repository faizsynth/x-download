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
    const twitterRegex = /https?:\/\/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/;
    if (!twitterRegex.test(url)) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          success: false, 
          error: 'Please enter a valid Twitter URL (e.g., https://twitter.com/user/status/123456789)' 
        })
      };
    }

    console.log('Processing Twitter URL:', url);

    // Method 1: Try using a public Twitter API proxy
    try {
      const apiResponse = await axios.get(`https://api.vxtwitter.com/${url.split('/').pop()}/status/${url.split('/').pop()}`, {
        timeout: 10000
      });
      
      if (apiResponse.data && apiResponse.data.media_extended && apiResponse.data.media_extended.length > 0) {
        const video = apiResponse.data.media_extended.find(media => media.type === 'video');
        if (video && video.url) {
          return {
            statusCode: 200,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              success: true,
              videoUrl: video.url,
              downloadUrl: video.url,
              message: 'Video found successfully!'
            })
          };
        }
      }
    } catch (apiError) {
      console.log('API method failed, trying direct scraping...');
    }

    // Method 2: Direct scraping with enhanced headers
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0'
      },
      timeout: 15000
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Enhanced video extraction methods
    let videoUrl = null;

    // Method 1: Look for JSON data in script tags
    const scriptTags = $('script[type="application/json"], script[type="application/ld+json"]');
    
    for (let i = 0; i < scriptTags.length; i++) {
      try {
        const scriptContent = $(scriptTags[i]).html();
        if (scriptContent) {
          // Look for video URLs in JSON
          const jsonData = JSON.parse(scriptContent);
          const searchForVideo = (obj) => {
            for (let key in obj) {
              if (typeof obj[key] === 'string' && obj[key].includes('.mp4')) {
                videoUrl = obj[key];
                return true;
              }
              if (typeof obj[key] === 'object' && obj[key] !== null) {
                if (searchForVideo(obj[key])) return true;
              }
            }
            return false;
          };
          if (searchForVideo(jsonData)) break;
        }
      } catch (e) {
        // Continue if JSON parsing fails
      }
    }

    // Method 2: Look for video tags with specific attributes
    if (!videoUrl) {
      $('video').each((i, element) => {
        const src = $(element).attr('src');
        const videoSrc = $(element).attr('data-src');
        if (src && src.includes('.mp4')) {
          videoUrl = src;
          return false;
        }
        if (videoSrc && videoSrc.includes('.mp4')) {
          videoUrl = videoSrc;
          return false;
        }
      });
    }

    // Method 3: Look for meta tags
    if (!videoUrl) {
      videoUrl = $('meta[property="og:video"]').attr('content') || 
                 $('meta[property="og:video:url"]').attr('content') ||
                 $('meta[name="twitter:player:stream"]').attr('content');
    }

    // Method 4: Search entire HTML for MP4 patterns
    if (!videoUrl) {
      const mp4Matches = html.match(/(https?:\/\/[^"']*\.mp4[^"']*)/g);
      if (mp4Matches && mp4Matches.length > 0) {
        // Filter for Twitter video URLs
        const twitterVideo = mp4Matches.find(url => 
          url.includes('video.twimg.com') || 
          url.includes('amp.twimg.com')
        );
        if (twitterVideo) {
          videoUrl = twitterVideo;
        }
      }
    }

    if (videoUrl) {
      // Ensure URL is absolute
      if (videoUrl.startsWith('//')) {
        videoUrl = 'https:' + videoUrl;
      } else if (videoUrl.startsWith('/')) {
        videoUrl = 'https://twitter.com' + videoUrl;
      }

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
          downloadUrl: videoUrl,
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
          error: 'No video found. This might be due to:\n• Private/protected tweet\n• Age-restricted content\n• Twitter API limitations\n• The tweet might not contain a video\n\nTry a different public tweet with a video.'
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
        errorMessage = 'Access denied. The tweet might be private, restricted, or require login.';
      } else if (error.response.status === 429) {
        errorMessage = 'Rate limit exceeded. Please wait a few minutes and try again.';
      }
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = 'Request timeout. Please try again.';
    } else if (error.message.includes('ENOTFOUND')) {
      errorMessage = 'Network error. Please check your connection.';
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
