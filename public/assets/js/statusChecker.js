// In your public/js/statusChecker.js
let checkInterval = 30000; // Start with 30 seconds
let retryCount = 0;

const checkStatus = async () => {
  try {
    const response = await fetch('/api/check-status', {
      credentials: 'include'
    });

    if (response.status === 429) {
      const data = await response.json();
      checkInterval = data.retry_after * 1000 + 1000; // Add buffer
      retryCount++;
      showNotification(`Please wait ${data.retry_after} seconds before checking again`, 'warning');
      return;
    }

    if (!response.ok) throw new Error('Network response was not ok');
    
    const data = await response.json();
    retryCount = 0;
    checkInterval = 30000; // Reset to default on success

    if (data.changed) {
      showNotification('Your whitelist status has been updated!', 'success');
      setTimeout(() => window.location.reload(), 3000);
    }
  } catch (error) {
    console.error('Status check failed:', error);
    retryCount++;
    if (retryCount >= 3) {
      showNotification('Failed to check status - please refresh page', 'error');
      clearInterval(intervalId);
    }
  }
};

// Adjust the interval dynamically
let intervalId = setInterval(() => {
  checkStatus();
}, checkInterval);