const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());

// storage setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

const upload = multer({ storage });

// upload route
app.post('/upload', upload.single('file'), (req, res) => {
  res.json({
    message: "File uploaded",
    file: req.file,
    url: `http://localhost:5000/uploads/${req.file.filename}`
  });
});

// PDF → B&W conversion route
// Requires Ghostscript installed on the server machine.
// Windows: download from https://www.ghostscript.com/download/gsdnld.html
//          then set GS_PATH=C:\Program Files\gs\gs10.04.0\bin\gswin64c.exe in your env
// macOS/Linux: brew install ghostscript  OR  apt-get install ghostscript  (gs is on PATH)
const GS_PATH = process.env.GS_PATH || (process.platform === 'win32' ? 'gswin64c' : 'gs');
const API_KEY = process.env.CONVERT_API_KEY || '';

function checkApiKey(req, res, next) {
  if (!API_KEY) return next(); // no key configured — open (local dev only)
  if (req.headers['x-api-key'] !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

app.post('/convert-pdf-bw', checkApiKey, upload.single('pdf'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' });

  const inputPath = path.resolve(req.file.path);
  const outputName = `bw_${Date.now()}_${req.file.originalname}`;
  const outputPath = path.resolve('uploads', outputName);

  const args = [
    `-sOutputFile=${outputPath}`,
    '-sDEVICE=pdfwrite',
    '-sColorConversionStrategy=Gray',
    '-dProcessColorModel=/DeviceGray',
    '-dCompatibilityLevel=1.4',
    '-dNOPAUSE',
    '-dBATCH',
    inputPath,
  ];

  execFile(GS_PATH, args, (err, _stdout, stderr) => {
    // clean up the uploaded input regardless
    try { fs.unlinkSync(inputPath); } catch {}

    if (err) {
      console.error('Ghostscript error:', stderr || err.message);
      return res.status(500).json({
        error: 'PDF conversion failed. Is Ghostscript installed? Set GS_PATH env var if needed.',
      });
    }

    const host = req.get('host') || 'localhost:5000';
    const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
    res.json({ url: `${proto}://${host}/uploads/${outputName}` });

    // clean up converted file after 10 minutes
    setTimeout(() => { try { fs.unlinkSync(outputPath); } catch {} }, 10 * 60 * 1000);
  });
});

// serve files
app.use('/uploads', express.static('uploads'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));