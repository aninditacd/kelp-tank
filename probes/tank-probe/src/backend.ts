// No tests by design: this probe is one-off evidence tooling (see probes/tank-probe/README.md).
// tests/probe-backend.test.ts only guards that it never polls.
/**
 * Probe backend: logs one line per event Kelpi pushes to it (except the per-second system stats), so `kelpi plugin logs` shows what a
 * plugin backend hears, and logs whatever the probe view reports. It never polls.
 */
interface ProbeApi {
    events: { on(name: string, listener: (event: unknown) => void): () => void };
    commands: { register(id: string, handler: (args?: unknown) => unknown): () => void };
}

export function activate(api: ProbeApi) {
    const off = api.events.on('*', (event) => {
        const { name, sequence, data } = event as { name: string; sequence: number; data: unknown };
        if (name === 'daemon.system-stats') return;
        const kinds = Array.isArray(data) ? data.map((item: { kind?: string }) => item.kind) : [];
        console.log(`event ${sequence} ${name} ${kinds.join(',')}`);
    });
    const unregister = api.commands.register('dita.kelp-tank-probe.report', (args) => {
        console.log(`report ${JSON.stringify(args)}`);
        return { ok: true };
    });
    return () => {
        off();
        unregister();
    };
}
