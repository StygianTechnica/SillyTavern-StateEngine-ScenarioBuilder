// SillyTavern's Connection Manager profiles, for the generation connection
// picker - read the same way State Engine and Archivist read them. [] when
// the Connection Manager isn't available. -> [{ id, name }]
export function listConnectionProfiles() {
    try {
        const context = SillyTavern.getContext();
        const service = context.ConnectionManagerRequestService;
        const profiles = typeof service?.getSupportedProfiles === 'function'
            ? service.getSupportedProfiles()
            : context.extensionSettings?.connectionManager?.profiles;
        return (Array.isArray(profiles) ? profiles : [])
            .filter((p) => p && p.id)
            .map((p) => ({ id: String(p.id), name: String(p.name || p.id) }));
    } catch {
        return [];
    }
}
