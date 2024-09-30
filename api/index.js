const { Telegraf } = require('telegraf');
const express = require('express');
const axios = require('axios');

// 替换为你的 Telegram Bot 的 Token
const TOKEN = process.env.TELEGRAM_TOKEN;
const bot = new Telegraf(TOKEN);

const MAX_VIDEO_SIZE = 50 * 1024 * 1024;  // 50MB
const MAX_PHOTO_SIZE = 10 * 1024 * 1024;  // 10MB

const app = express();
app.use(express.json());

// 处理 /start 命令
bot.start(async (ctx) => {
    await ctx.reply('你好！我是你的电报机器人。请发送视频或图片链接，我会帮你解析。');
});

// 获取文件大小
async function getFileSize(url) {
    try {
        const response = await axios.head(url);
        const fileSize = parseInt(response.headers['content-length'], 10);
        return fileSize;
    } catch (error) {
        console.error(`无法获取文件大小: ${url}, 错误: ${error}`);
        return 0;
    }
}

// 处理用户消息，判断是否为链接
bot.on('text', async (ctx) => {
    const userMessage = ctx.message.text;
    const parsingMessage = await ctx.reply('正在解析中...');

    try {
        if (userMessage.includes('http')) {
            const parsedData = await parseLink(userMessage);

            if (parsedData && 'url_list' in parsedData.data && 'type' in parsedData.data) {
                const urlList = parsedData.data.url_list;
                const mediaType = parsedData.data.type;
                const title = parsedData.data.title || '未知标题';
                const desc = parsedData.data.desc || '未知正文';

                await ctx.telegram.editMessageText(ctx.chat.id, parsingMessage.message_id, null, `解析成功！\n标题：${title} ${desc}`);

                if (typeof urlList === 'string') {
                    await checkAndSendMedia(ctx, urlList, mediaType);
                } else if (Array.isArray(urlList)) {
                    if (mediaType === 'images') {
                        await sendMediaGroup(ctx, urlList);
                    } else {
                        for (const url of urlList) {
                            await checkAndSendMedia(ctx, url, mediaType);
                        }
                    }
                }
            } else {
                await ctx.telegram.editMessageText(ctx.chat.id, parsingMessage.message_id, null, '解析失败或没有可发送的媒体链接。');
            }
        } else {
            await ctx.telegram.editMessageText(ctx.chat.id, parsingMessage.message_id, null, '请发送有效的链接。');
        }
    } catch (error) {
        await ctx.telegram.editMessageText(ctx.chat.id, parsingMessage.message_id, null, `出现错误: ${error.message}`);
    }
});

// 根据媒体类型发送图片或视频
async function checkAndSendMedia(ctx, url, mediaType) {
    const fileSize = await getFileSize(url);

    try {
        if (mediaType === 'images' && fileSize > MAX_PHOTO_SIZE) {
            await ctx.reply(`图片文件过大，无法发送。请手动下载：${url}`);
        } else if (mediaType === 'video' && fileSize > MAX_VIDEO_SIZE) {
            await ctx.reply(`视频文件过大，无法发送。请手动下载：${url}`);
        } else {
            if (mediaType === 'images') {
                await ctx.replyWithPhoto(url);
            } else if (mediaType === 'video') {
                await ctx.replyWithVideo(url);
            } else {
                await ctx.reply(`无法识别的媒体类型: ${mediaType}`);
            }
        }
    } catch (error) {
        await ctx.reply(`发送失败: ${error.message}`);
    }
}

// 合并发送多张图片
async function sendMediaGroup(ctx, urlList) {
    const mediaGroup = [];

    for (const url of urlList) {
        const fileSize = await getFileSize(url);
        if (fileSize <= MAX_PHOTO_SIZE) {
            mediaGroup.push({ type: 'photo', media: url });
        } else {
            await ctx.reply(`图片文件过大，无法发送。请手动下载：${url}`);
        }
    }

    if (mediaGroup.length > 0) {
        try {
            await ctx.replyWithMediaGroup(mediaGroup);
        } catch (error) {
            await ctx.reply(`发送图片组失败: ${error.message}`);
        }
    }
}

// 调用解析接口的函数
async function parseLink(link) {
    const apiUrl = 'https://api.lau.plus/media/newapi.php';

    try {
        const response = await axios.post(apiUrl, {
            url: link,
            user: 'tgbot',
            mac: 'tgbot',
            clientid: 'tgbot',
        });

        return response.data;
    } catch (error) {
        console.error(`接口请求失败: ${error}`);
        return null;
    }
}

// Vercel 入口
app.post('/api/index', async (req, res) => {
    try {
        await bot.handleUpdate(req.body);
        res.status(200).send('ok');
    } catch (error) {
        console.error(`处理Telegram更新时出错: ${error}`);
        res.status(500).send('Error');
    }
});

module.exports = app;
