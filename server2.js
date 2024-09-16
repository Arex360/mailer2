const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

// Read your certificate and key
const privateKey = fs.readFileSync('./maileye.work.gd.key', 'utf8');
const certificate = fs.readFileSync('./maileye.work.gd.cer', 'utf8');
const credentials = { key: privateKey, cert: certificate };

// Create the images folder if it doesn't exist
const imagesFolder = path.join(__dirname, 'images');
if (!fs.existsSync(imagesFolder)) {
    fs.mkdirSync(imagesFolder);
}

const app = express();
app.use(cors());

// Set body parser to allow payload of up to 50 MB
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Generate a SHA-256 hash based on timestamp and a random number
function generateHash() {
    const randomString = crypto.randomBytes(16).toString('hex') + Date.now();
    return crypto.createHash('sha256').update(randomString).digest('hex');
}

// Save the base64 image as a PNG file
function saveBase64Image(base64Data, filename) {
    const buffer = Buffer.from(base64Data, 'base64');
    const imagePath = path.join(imagesFolder, `${filename}.png`);
    fs.writeFileSync(imagePath, buffer);
    return imagePath;
}

// Store image view status (number of views) in a JSON file
function storeImageStatus(hash) {
    const statusFilePath = path.join(__dirname, 'imageStatus.json');
    let imageStatus = {};

    // Read existing statuses from JSON
    if (fs.existsSync(statusFilePath)) {
        const rawData = fs.readFileSync(statusFilePath);
        imageStatus = JSON.parse(rawData);
    }

    // Initialize or increment the view count for the image
    if (!imageStatus[hash]) {
        imageStatus[hash] = { views: 0 };
    }
    imageStatus[hash].views += 1;

    fs.writeFileSync(statusFilePath, JSON.stringify(imageStatus, null, 2));
}

// Retrieve the number of views for an image
function getImageStatus(hash) {
    const statusFilePath = path.join(__dirname, 'imageStatus.json');
    if (fs.existsSync(statusFilePath)) {
        const rawData = fs.readFileSync(statusFilePath);
        const imageStatus = JSON.parse(rawData);
        return imageStatus[hash] ? imageStatus[hash].views : 0; // Default to 0 views if no record exists
    }
    return 0;
}

// Email route
app.post('/sendemail', async (req, res) => {
    console.log("got request");
    const { to, subject, text, network, email, appPassword, port, server } = req.body;
    
    // Base64 encoded image
    const base64Image = "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"
    // Generate hash for the image
    const hash = generateHash();
    
    // Save the image to the images folder
    saveBase64Image(base64Image, hash);

    // Initialize the view count to 0 (not viewed yet)
    storeImageStatus(hash);

    let htmlBody = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email</title>
    </head>
    <body>
        ${text}
        <img src="https://maileye.work.gd/getimg/${hash}" alt="Image"/>
    </body>
    </html>
    `;

    const transporter = nodemailer.createTransport({
        host: server,
        port: port,
        secure: port === '465', // Use true for port 465, false for other ports
        auth: {
            user: email,
            pass: appPassword,
        },
    });

    console.log({ to, subject, text, network, email, appPassword, port, server });

    try {
        await transporter.sendMail({
            from: email, // sender address
            to, // list of receivers
            subject, // Subject line
            html: htmlBody, // HTML body
        });
        console.log("sent mail");
        res.status(200).send('Email sent successfully :' + hash);
    } catch (error) {
        console.log("error", error);
        res.status(500).send('Error sending email');
    }
});

// Route to serve the image based on hash
app.get('/getimg/:hash', (req, res) => {
    const hash = req.params.hash;
    const imagePath = path.join(imagesFolder, `${hash}.png`);

    if (fs.existsSync(imagePath)) {
        // Increment the view count
        storeImageStatus(hash);

        res.sendFile(imagePath);
    } else {
        res.status(404).send('Image not found');
    }
});

// Route to check how many times the image has been viewed
app.get('/check/hash/:hash', (req, res) => {
    const hash = req.params.hash;
    const views = getImageStatus(hash);

    res.json({ hash, views });
});

// Create HTTPS server
const httpsServer = https.createServer(credentials, app);

httpsServer.listen(443, () => {
    console.log('HTTPS Server running on port 443');
});
