import { Router } from 'express';

const router = Router();

const fetchAudio = async (url: string) => {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Accept: 'audio/mpeg,audio/*,*/*',
        },
    });
    if (!response.ok) throw new Error(`TTS_UPSTREAM_${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('audio') && !contentType.includes('mpeg')) {
        throw new Error('TTS_UPSTREAM_NOT_AUDIO');
    }
    return {
        buffer: Buffer.from(await response.arrayBuffer()),
        contentType: contentType.includes('audio') ? contentType : 'audio/mpeg',
    };
};

router.get('/ar', async (req, res) => {
    try {
        const text = String(req.query.text || '').trim().slice(0, 180);
        if (!text) return res.status(400).json({ error: 'TEXT_REQUIRED' });

        const providers = [
            `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=ar&ttsspeed=0.9&q=${encodeURIComponent(text)}`,
            `https://api.streamelements.com/kappa/v2/speech?voice=Zeina&text=${encodeURIComponent(text)}`,
        ];

        let lastError: unknown = null;
        for (const url of providers) {
            try {
                const audio = await fetchAudio(url);
                res.setHeader('Content-Type', audio.contentType);
                res.setHeader('Cache-Control', 'no-store');
                return res.send(audio.buffer);
            } catch (error) {
                lastError = error;
            }
        }

        return res.status(502).json({
            error: 'TTS_UPSTREAM_FAILED',
            message: lastError instanceof Error ? lastError.message : 'TTS upstream failed',
        });
    } catch (error: any) {
        return res.status(500).json({ error: 'TTS_FAILED', message: error?.message || 'TTS failed' });
    }
});

export default router;
