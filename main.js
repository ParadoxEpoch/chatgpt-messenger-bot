import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import { ChatGPTAPI } from 'chatgpt';
import { config as envConfig } from 'dotenv-safe';
envConfig();

const app = express();

app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

app.listen(3000);

// Facebook Page Access Token
let token = process.env.fbPageToken;

// Root route. Useful for checking bot status.
app.get('/', function (req, res) {
    res.send('GPTBot is running!');
});

// Webhook setup
app.get('/webhook/', function (req, res) {
    if (req.query['hub.verify_token'] === process.env.fbVerifyToken) {
        console.log('Got correct token for webhook get request');
        return res.send(req.query['hub.challenge']);
    }
    console.error('Got wrong verify token in webhook get request');
    return res.send('Error, wrong token');
});

// Post message to Facebook
async function sendTextMessage(sender, text) {

    const requestData = {
        recipient: {id: sender},
        message: {text: text},
    };

    console.log('Got message request!');
    console.log(requestData);

    try {
        await axios.post(`https://graph.facebook.com/v16.0/me/messages?access_token=${token}`, requestData);
    } catch (error) {
        console.error('Error sending messages:', error);
    }

}

// Send indicator that a message is being typed
async function sendTypingIndicator(sender, typingState) {

    const requestData = {
        recipient: {id: sender},
        sender_action: typingState ? "typing_on" : "typing_off",
    };

    try {
        await axios.post(`https://graph.facebook.com/v16.0/me/messages?access_token=${token}`, requestData);
    } catch (error) {
        console.error('Error sending typing indicator:', error);
    }

}

// Handle incoming messages
app.post('/webhook/', async function (req, res) {
    let messaging_events = req.body.entry[0].messaging;
    for (let i = 0; i < messaging_events.length; i++) {
        let event = messaging_events[i];
        let sender = event.sender.id;
        if (event.message && event.message.text && !event.message.app_id) {
            await sendTypingIndicator(sender, true);
            let text = event.message.text;
            const gptResponse = await sendToGpt(text);
            // ? Seems like we don't need to reset the typing indicator since Meta does it after sending a message anyway
            //await sendTypingIndicator(sender, false);
            sendTextMessage(sender, gptResponse);
        }
    }
    res.sendStatus(200);
});

async function sendToGpt(prompt) {
    // TODO: We shouldn't be creating a new ChatGPTAPI instance every time we send a message. Either instantiate globally or per-user.
    const api = new ChatGPTAPI({
        apiKey: process.env.openaiKey
    })

    console.log('Prompt: ' + prompt);
    const res = await api.sendMessage(prompt, {
        // TODO: I don't think Facebook supports partial messages so handling onProgress to update the response status is pointless, but this would be useful for a Discord bot...
        onProgress: (partialResponse) => {
            console.log(partialResponse.text)
        }
    });
    console.log(res);
    console.log(res.text);
    return res.text;
}