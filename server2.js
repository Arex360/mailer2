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

    // Initialize the view count to 0 (not viewed yet)
    storeImageStatus(hash);

    let htmlBody = `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email</title>
    </head>
    <body>
        ${text}
        <img src="https://contentprovider.vercel.app/proxy-image/${hash}" alt="Image"/>
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

    // Generate SHA-256 hash of the email address
    const emailHash = crypto.createHash('sha256').update(email).digest('hex');
    const usersFolder = path.join(__dirname, 'users');
    const userFilePath = path.join(usersFolder, `${emailHash}.json`);

    // Create the users folder if it doesn't exist
    if (!fs.existsSync(usersFolder)) {
        fs.mkdirSync(usersFolder);
    }

    // Create a new JSON file if it doesn't exist and store email details
    if (!fs.existsSync(userFilePath)) {
        const emailDetails = {
            emails: []
        };
        fs.writeFileSync(userFilePath, JSON.stringify(emailDetails, null, 2));
    }

    // Read existing emails from the JSON file
    const userData = JSON.parse(fs.readFileSync(userFilePath));
    
    // Add the new email details
    userData.emails.push({ to, subject, text,hash });

    // Save the updated email details back to the JSON file
    fs.writeFileSync(userFilePath, JSON.stringify(userData, null, 2));

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
// Route to get the JSON file for a user based on their email hash
app.get('/getuser/:emailHash', (req, res) => {
    const emailHash = req.params.emailHash;
    const usersFolder = path.join(__dirname, 'users');
    const userFilePath = path.join(usersFolder, `${emailHash}.json`);

    // Check if the file exists
    if (fs.existsSync(userFilePath)) {
        // Read and send the file contents
        const userData = fs.readFileSync(userFilePath);
        res.setHeader('Content-Type', 'application/json');
        res.send(userData);
    } else {
        res.status(404).send('User data not found');
    }
});

// Create HTTPS server
const httpsServer = https.createServer(credentials, app);

httpsServer.listen(443, () => {
    console.log('HTTPS Server running on port 443');
});
