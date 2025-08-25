// IMPORT
import { Client, PermissionsBitField, REST, Routes, SlashCommandBuilder } from 'discord.js'
import OpenAI from 'openai'
import Enmap from 'enmap'

// SETUP
const client = new Client({ intents: 33281 })
const disabledChannels = new Set()
const channelHistory = {}
const responseTimers = {}

// DATABASE
const config = new Enmap({ name: 'config' })
if (!config.has('PROMPT')) config.set('PROMPT', 'Você é um assistente de dúvidas. Responda de forma curta, clara e objetiva, sem explicações longas. Use apenas as informações que eu fornecer como conhecimentos específicos. Se não souber a resposta com base nesses conhecimentos, diga que não sabe. Foque em praticidade e concisão.')
if (!config.has('TOKEN_OPENAI')) config.set('TOKEN_OPENAI', '')
if (!config.has('DEBOUNCE')) config.set('DEBOUNCE', 30)
if (!config.has('HISTORY')) config.set('HISTORY', 10)
if (!config.has('SCOPE')) config.set('SCOPE', 'ticket')

// REGISTER SLASH COMMANDS
const commands = [
  new SlashCommandBuilder()
    .setName('supset')
    .setDescription('Update bot settings')
    .addStringOption(opt => opt.setName('key').setDescription('Setting to update').setRequired(true).addChoices(
      { name: 'TOKEN_OPENAI', value: 'TOKEN_OPENAI' },
      { name: 'DEBOUNCE', value: 'DEBOUNCE' },
      { name: 'HISTORY', value: 'HISTORY' },
      { name: 'PROMPT', value: 'PROMPT' },
      { name: 'SCOPE', value: 'SCOPE' }
    ))
    .addStringOption(opt => opt.setName('value').setDescription('New value').setRequired(true)),
  new SlashCommandBuilder()
    .setName('enable')
    .setDescription('Enable bot in this channel'),
  new SlashCommandBuilder()
    .setName('disable')
    .setDescription('Disable bot in this channel')
].map(cmd => cmd.toJSON())

const rest = new REST({ version: '10' }).setToken('MTQwNzA4MDI4NzYyNzkwMzA4OA.G46xI5.7iJF6O6rqF-3qX0RgWju-v6JMwpi5rRb-pgPn4')
rest.put(Routes.applicationCommands('1407080287627903088'), { body: commands })

// SLASH COMMAND HANDLER
client.on('interactionCreate', async interaction => {
  try {
    if (!interaction.isChatInputCommand()) return

    if (interaction.commandName === 'supset') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
        return interaction.reply({ content: 'You must be an admin.', ephemeral: true })

      const key = interaction.options.getString('key')
      const value = interaction.options.getString('value')

      if (['DEBOUNCE', 'HISTORY'].includes(key)) {
        const num = parseInt(value)
        if (isNaN(num) || num < 0) return interaction.reply({ content: `**${key}** must be a positive number.`, ephemeral: true })
        config.set(key, num)
      } else {
        config.set(key, value)
      }

      return interaction.reply({ content: `**${key}** updated.`, ephemeral: true })
    }

    if (interaction.commandName === 'enable') {
      disabledChannels.delete(interaction.channel.id)
      return interaction.reply({ content: 'Bot enabled in this channel.', ephemeral: true })
    }

    if (interaction.commandName === 'disable') {
      disabledChannels.add(interaction.channel.id)
      return interaction.reply({ content: 'Bot disabled in this channel.', ephemeral: true })
    }
  } catch (_) { }
})

// MESSAGE HANDLER
client.on('messageCreate', async message => {
  try {
    if (message.author.bot) return

    const scopeId = config.get('SCOPE')
    if ((Date.now() - message.channel.createdTimestamp) > 24 * 60 * 60e3 || disabledChannels.has(message.channel.id) || message.channel.id !== scopeId && message.channel.parentId !== scopeId && !message.channel.name.includes(scopeId)) return

    if (!channelHistory[message.channel.id]) channelHistory[message.channel.id] = []
    channelHistory[message.channel.id].push({ role: 'user', content: message.content })
    if (channelHistory[message.channel.id].length > config.get('HISTORY'))
      channelHistory[message.channel.id].shift()

    if (responseTimers[message.channel.id]) clearTimeout(responseTimers[message.channel.id])
    responseTimers[message.channel.id] = setTimeout(async () => {
      try {
        const history = channelHistory[message.channel.id]
        const last = history[history.length - 1]
        const context = history.slice(0, -1)

        const openai = new OpenAI({ apiKey: config.get('TOKEN_OPENAI') })
        const response = await openai.responses.create({
          model: 'gpt-5-nano',
          service_tier: 'flex',
          input: [
            { role: 'system', content: config.get('PROMPT') },
            { role: 'system', content: 'Responda apenas a última mensagem do usuário, usando as anteriores só como referência.' },
            ...context,
            last
          ]
        })

        const reply = response.output_text
        channelHistory[message.channel.id].push({ role: 'assistant', content: reply })

        for (let i = 0; i < reply.length; i += 2000)
          await message.channel.send(reply.slice(i, i + 2000))
      } catch (err) {
        message.channel.send('Nosso sistema de suporte está passando por uma manutenção, tente novamente em alguns minutos.')
        console.error(err)
      }
    }, config.get('DEBOUNCE') * 1e3)
  } catch (_) { }
})

// RUN
client.login('MTQwNzA4MDI4NzYyNzkwMzA4OA.G46xI5.7iJF6O6rqF-3qX0RgWju-v6JMwpi5rRb-pgPn4')
