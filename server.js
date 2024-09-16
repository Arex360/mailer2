const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const https = require('https');
const fs = require('fs');

// Read your certificate and key
const privateKey = fs.readFileSync('./maileye.work.gd.key', 'utf8');
const certificate = fs.readFileSync('./maileye.work.gd.cer', 'utf8');
const credentials = { key: privateKey, cert: certificate };

const app = express();
app.use(cors());

// Set body parser to allow payload of up to 50 MB
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

app.post('/sendemail', async (req, res) => {
    console.log("got request");
    const { to, subject, text, network, email, appPassword, port, server } = req.body;

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
        res.status(200).send('Email sent successfully');
    } catch (error) {
        console.log("error", error);
        res.status(500).send('Error sending email');
    }
});

app.get('/', (req, res) => res.send("Email service is working"));

// Create HTTPS server
const httpsServer = https.createServer(credentials, app);

httpsServer.listen(443, () => {
    console.log('HTTPS Server running on port 443');
});
