const { Client, Intents } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, StreamType, AudioPlayerStatus } = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const YouTube = require('youtube-sr').default;
const ytpl = require('ytpl');
require('dotenv').config();
const token = process.env.BOT_TOKEN; // Bot tokeninizi buraya girin

const client = new Client({
    intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_VOICE_STATES, Intents.FLAGS.GUILD_MESSAGES]
});

const queue = new Map();

client.once('ready', () => {
    console.log('Bot hazır!');
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;

    const serverQueue = queue.get(message.guild.id);

    if (message.content.startsWith('!play')) {
        execute(message, serverQueue);
        return;
    } else if (message.content.startsWith('!skip')) {
        skip(message, serverQueue);
        return;
    } else if (message.content.startsWith('!stop')) {
        stop(message, serverQueue);
        return;
    } else {
        message.channel.send('Geçersiz komut');
    }
});

async function execute(message, serverQueue) {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel)
        return message.channel.send('Müzik çalmak için bir ses kanalında olmanız gerekiyor!');
    
    const permissions = voiceChannel.permissionsFor(message.client.user);
    if (!permissions.has('CONNECT') || !permissions.has('SPEAK')) {
        return message.channel.send('Bu kanala bağlanmak ve konuşmak için izinlerim yok!');
    }

    const input = message.content.replace('!play ', '');

    try {
        let playlistID = null;
        try {
            playlistID = await ytpl.getPlaylistID(input);
        } catch (error) {
            console.log('Not a playlist URL');
        }

        if (playlistID) {
            const playlist = await ytpl(playlistID);
            const videos = playlist.items;
            if (!serverQueue) {
                const queueConstruct = {
                    textChannel: message.channel,
                    voiceChannel: voiceChannel,
                    connection: null,
                    songs: [],
                    volume: 5,
                    playing: true,
                };
                queue.set(message.guild.id, queueConstruct);
                videos.forEach((video) => {
                    queueConstruct.songs.push({ title: video.title, url: video.url });
                });
                try {
                    var connection = joinVoiceChannel({
                        channelId: voiceChannel.id,
                        guildId: message.guild.id,
                        adapterCreator: message.guild.voiceAdapterCreator,
                    });
                    queueConstruct.connection = connection;
                    play(message.guild, queueConstruct.songs[0]);
                } catch (err) {
                    console.log(err);
                    queue.delete(message.guild.id);
                    return message.channel.send(err);
                }
            } else {
                videos.forEach((video) => serverQueue.songs.push({ title: video.title, url: video.url }));
                return message.channel.send(`Playlist ${playlist.title} sıraya eklendi!`);
            }
        } else {
            const songInfo = await searchYouTube(input);
            if (!songInfo) return message.channel.send('Şarkı bulunamadı.');
            const song = {
                title: songInfo.videoDetails.title,
                url: songInfo.videoDetails.video_url,
            };

            if (!serverQueue) {
                const queueContruct = {
                    textChannel: message.channel,
                    voiceChannel: voiceChannel,
                    connection: null,
                    songs: [],
                    volume: 5,
                    playing: true,
                };

                queue.set(message.guild.id, queueContruct);
                queueContruct.songs.push(song);

                try {
                    var connection = joinVoiceChannel({
                        channelId: voiceChannel.id,
                        guildId: message.guild.id,
                        adapterCreator: message.guild.voiceAdapterCreator,
                    });
                    queueContruct.connection = connection;
                    play(message.guild, queueContruct.songs[0]);
                } catch (err) {
                    console.log(err);
                    queue.delete(message.guild.id);
                    return message.channel.send(err);
                }
            } else {
                serverQueue.songs.push(song);
                return message.channel.send(`${song.title} sıraya eklendi!`);
            }
        }
    } catch (error) {
        console.error(error);
        message.channel.send('Bir hata oluştu: ' + error.message);
    }
}

function skip(message, serverQueue) {
    if (!message.member.voice.channel)
        return message.channel.send('Bir şarkıyı geçmek için ses kanalında olmanız gerekiyor!');
    if (!serverQueue)
        return message.channel.send('Geçecek şarkı yok!');
    serverQueue.songs.shift();
    play(message.guild, serverQueue.songs[0]);
}

function stop(message, serverQueue) {
    if (!message.member.voice.channel)
        return message.channel.send('Müziği durdurmak için ses kanalında olmanız gerekiyor!');
    if (!serverQueue)
        return message.channel.send('Durdurulacak müzik yok!');
    serverQueue.songs = [];
    serverQueue.connection.destroy();
    queue.delete(message.guild.id);
}

function play(guild, song) {
    const serverQueue = queue.get(guild.id);
    if (!song) {
        // serverQueue.voiceChannel.leave();
        queue.delete(guild.id);
        return;
    }

    const stream = ytdl(song.url, { filter: 'audioonly', highWaterMark: 1 << 25 });
    const resource = createAudioResource(stream, { inputType: StreamType.Arbitrary });
    const audioPlayer = createAudioPlayer();

    audioPlayer.play(resource);
    serverQueue.connection.subscribe(audioPlayer);

    audioPlayer.on(AudioPlayerStatus.Idle, () => {
        serverQueue.songs.shift();
        play(guild, serverQueue.songs[0]);
    });

    audioPlayer.on('error', error => console.error(error));
    serverQueue.textChannel.send(`Şimdi çalıyor: **${song.title}**`).catch(console.error);
}

async function searchYouTube(query) {
    if (ytdl.validateURL(query)) {
        return ytdl.getInfo(query);
    } else {
        const searchResult = await YouTube.searchOne(query);
        return searchResult ? ytdl.getInfo(searchResult.url) : null;
    }
}

client.login(token);
