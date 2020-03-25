const express = require('express')
const app = express()
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken');
var mongoose = require("mongoose");
const path = require("path")
const upload = require('express-fileupload')
const videoFormat = ['mp4','mkv','h264','ogg','3gp','hls','webm']
mongoose.Promise = global.Promise;
mongoose.connect("mongodb://localhost:27017/revidly");
const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  resetCode: Number,
});
const videoSchema = new mongoose.Schema({
  userId: String,
  videoLink: String,
});
const User = mongoose.model("User", userSchema);
const Video = mongoose.model("Video", videoSchema);


const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);


app.use(express.json())
app.use(upload())

app.get('/users', async (req, res) => {
  const users = await User.find();
  res.json(users)
})

async function hashPassword(password) {
  const hashedPassword = await bcrypt.hash(password, 10)
  return hashedPassword;
}
async function generateAccessToken(userObject) {
  const token = jwt.sign({
    data: userObject
  }, 'secret', { expiresIn: '1h' });
  return token;
}

async function decodeAccessToken(accessToken) {
  try {
    const decoded = jwt.verify(accessToken, 'secret');
    if (decoded) {
      return decoded.data.email
    }
    return null;
  } catch (err) {
    throw (err)
  }
}

app.post('/users', async (req, res) => {
  try {
    const email = req.body.email;
    const password = req.body.password
    if (!email || !password) {
      return res.status(400).send('email or passwrod cannot be empty')
    }
    const hashedPassword = await hashPassword(password)
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(406).send('User with this email already exist')
    }
    const user = { email, password: hashedPassword }
    const newUser = new User(user);
    await newUser.save()
    res.status(201).send('User created successfully')

  } catch {
    res.status(500).send()
  }
})

app.post('/users/login', async (req, res) => {
  const user = await User.findOne({ email: req.body.email })
  if (user == null) {
    return res.status(400).send('Cannot find user')
  }
  try {
    if (await bcrypt.compare(req.body.password, user.password)) {
      const accessToken = await generateAccessToken({ email: user.email })
      console.log(accessToken);
      return res.json({accessToken})
    } else {
      return res.send('Not Allowed')
    }
  } catch {
    res.status(500).send()
  }
})

app.post('/users/forget-password', async (req, res, next) => {
  const email = req.body.email;
  const user = await User.findOne({ email });
  if (!user) {
    return res.status(400).send('Cannot find user')
  }
  const randomCode = Math.floor(1000 + Math.random() * 9000);
  user.resetCode = randomCode;
  await user.save()
  const msgObj = {
    to: email,
    from: 'test@example.com',
    subject: 'Forget password code',
    text: `Please copy you code`,
    html: `<strong>${randomCode}</strong>`,
  }
  try {
    await sgMail.send(msgObj);
    res.json('Check your mail')
  } catch (err) {
    throw err;
  }
})

app.post('/users/verify-code', async (req, res, next) => {
  const email = req.body.email;
  const user = await User.findOne({ email });
  if (!user) {
    return res.status(400).send('Cannot find user')
  }
  const randomCode = req.body.randomCode
  if (user.resetCode == randomCode) {
    user.password = await hashPassword(req.body.password);
    user.resetCode = Math.floor(Math.random() * 100000000);
    await user.save()
    res.status(201).send('password changed successfully')
  } else {
    return res.status(400).send('Invalid code')
  }
})

app.post('/video/upload', async (req, res, next) => {
  const email = await decodeAccessToken(req.headers.authorization)
  if (!email) {
    return res.status(401).send('Unauthorized')
  }
  const user = await User.findOne({ email });
  // console.log(user)
  // console.log(req.files)
  if (user && req.files) {
    // console.log(user);
    const file = req.files.filename;
    const filename = file.name;
    const splittedFileName = filename.split('.')
    const extension = splittedFileName[1];
    if(!videoFormat.indexOf(extension)) {
      return res.status(415).send('File format not supported')
    }
    file.mv('./upload/' + filename, async (err,data) => {
      if (err) {
        throw err;
      }
      const videoInstance = new Video();
      videoInstance.userId = user._id;
      videoInstance.videoLink = '/upload/' + filename
      await videoInstance.save()
      console.log(videoInstance)
      return res.status(201).send('File uploaded successfully')
    })
  }
})

app.get('/video',async (req, res, next) => {
  console.log(req.headers.authorization)
  const email = await decodeAccessToken(req.headers.authorization)
  if (!email) {
    return res.status(401).send('Unauthorized')
  }
  const user = await User.findOne({ email });
  const videos = await Video.find({userId: await user._id})
  res.json(videos)
})

app.listen(3000)