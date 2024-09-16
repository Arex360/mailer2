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

// Store image view status in a JSON file
function storeImageStatus(hash, viewed = false) {
    const statusFilePath = path.join(__dirname, 'imageStatus.json');
    let imageStatus = {};

    // Read existing statuses from JSON
    if (fs.existsSync(statusFilePath)) {
        const rawData = fs.readFileSync(statusFilePath);
        imageStatus = JSON.parse(rawData);
    }

    // Update the status for the image
    imageStatus[hash] = viewed;
    fs.writeFileSync(statusFilePath, JSON.stringify(imageStatus, null, 2));
}

// Retrieve image view status
function getImageStatus(hash) {
    const statusFilePath = path.join(__dirname, 'imageStatus.json');
    if (fs.existsSync(statusFilePath)) {
        const rawData = fs.readFileSync(statusFilePath);
        const imageStatus = JSON.parse(rawData);
        return imageStatus[hash] || false; // Default to false if no record exists
    }
    return false;
}

// Email route
app.post('/sendemail', async (req, res) => {
    console.log("got request");
    const { to, subject, text, network, email, appPassword, port, server } = req.body;
    
    // Base64 encoded image
    const base64Image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAsTAAALEwEAmpwYAAAABGdBTUEAALGOfPtRkwAAACBjSFJNAAB6JQAAgIMAAPn/AACA6QAAdTAAAOpgAAA6mAAAF2+SX8VGAAAAD0lEQVR42mL4//8/QIABAAX+Av4tzonuAAAAAElFTkSuQmCC";

    // Generate hash for the image
    const hash = generateHash();
    
    // Save the image to the images folder
    saveBase64Image(base64Image, hash);

    // Store the image's view status as "not viewed"
    storeImageStatus(hash, false);

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
        res.status(200).send('Email sent successfully: '+hash);
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
        // Update the status to "viewed"
        storeImageStatus(hash, true);

        res.sendFile(imagePath);
    } else {
        res.status(404).send('Image not found');
    }
});

// Route to check if the image has been viewed
app.get('/check/hash/:hash', (req, res) => {
    const hash = req.params.hash;
    const viewed = getImageStatus(hash);

    res.json({ hash, viewed });
});

// Create HTTPS server
const httpsServer = https.createServer(credentials, app);

httpsServer.listen(443, () => {
    console.log('HTTPS Server running on port 443');
});
