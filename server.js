const express = require('express');
const app = express();
const port = process.env.PORT || 8080;

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Service is healthy' });
});

// Main route
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>CI/CD Node App</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #282c34;
            color: #61dafb;
            text-align: center;
            padding: 50px;
          }
          h1 {
            font-size: 2.5rem;
          }
          p {
            font-size: 1.2rem;
          }
        </style>
      </head>
      <body>
        <h1>🚀 Node.js CI/CD Demo</h1>
        <p>This app is running with custom styles for CI/CD DevSecOp presentation! by suraaj using Jenkins</p>
      </body>
    </html>
  `);
});

// Start server
app.listen(port, () => {
  console.log(`✅ Application is listening at http://localhost:${port}`);
});
