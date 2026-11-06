// The page script in the demonstration: the reader's prompts per hour multiply the chat row.
plate.register('session-energy', {
  render(ctx) {
    ctx.auto();
    const base = ctx.data.rows.find((r) => r.key === 'chat' && r.when === ctx.state.boundary);
    if (!base) return;
    const value = base.value * ctx.state.use;
    const text = plate.draw.fmt(value);
    ctx.setRow('chat', { frac: ctx.frac(value), text: `${text} Wh` });
    if (ctx.key !== 'chat') return;
    ctx.readout(text, 'Wh');
    ctx.reading(`At ${ctx.state.use} prompts an hour, the reader's assumption, a chat session used ${text} Wh inside the data center. ${base.reading}`);
  },
});

// The model's arithmetic lives in a page script: it writes the branches the plate's formulas read, then the kit draws.
plate.register('hour-demo', {
  render(ctx) {
    const { now } = ctx.data.env;
    const dc = ctx.state.prompts * ctx.data.env.prompt;
    const chat = { ...now.chat, data_center: dc, total: dc + now.chat.network + now.chat.router + now.chat.device };
    ctx.inputs.now = { ...now, chat };
    ctx.auto();
  },
});
