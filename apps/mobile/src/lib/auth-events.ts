type Listener = () => void;

const listeners = new Set<Listener>();

export const authEvents = {
  onSessionExpired(fn: Listener) {
    listeners.add(fn);

    return () => {
      listeners.delete(fn);
    };
  },

  emit() {
    listeners.forEach((fn) => fn());
  },
};
