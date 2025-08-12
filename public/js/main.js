// Server status refresh
if (document.querySelector('.server-status')) {
    setInterval(async () => {
        try {
            const response = await fetch('/server-status');
            const data = await response.json();
            updateServerStatus(data);
        } catch (error) {
            console.error('Error fetching server status:', error);
        }
    }, 60000); // Refresh every minute
}

function updateServerStatus(data) {
    const statusElement = document.querySelector('.status');
    if (!statusElement) return;

    if (data.online) {
        statusElement.innerHTML = `
            <p>Server is ONLINE</p>
            <p>Players: ${data.players}/${data.maxPlayers}</p>
            <p>${data.hostname}</p>
        `;
        statusElement.className = 'status online';
    } else {
        statusElement.innerHTML = '<p>Server is OFFLINE</p>';
        statusElement.className = 'status offline';
    }
}

// Admin panel actions
document.querySelectorAll('.approve').forEach(button => {
    button.addEventListener('click', () => handleApplicationAction(button, 'approve'));
});

document.querySelectorAll('.deny').forEach(button => {
    button.addEventListener('click', () => handleApplicationAction(button, 'deny'));
});

async function handleApplicationAction(button, action) {
    const applicationId = button.dataset.id;
    try {
        const response = await fetch(`/admin/application/${applicationId}/${action}`, {
            method: 'POST'
        });
        
        if (response.ok) {
            button.closest('.application').remove();
        } else {
            alert('Failed to process application');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred');
    }
}