// Just the strings. Split out from lib/i18n.ts because importing that file from
// a server component crashed the build: react-i18next calls React.createContext
// at module scope, which does not exist in the server runtime.
//
// The split is not a design decision. It is the shape the framework forced, and
// it is why the dashboard page reads these strings directly with a two-line
// lookup instead of using the i18n library it installed.
export const resources = {
  en: {
    translation: {
      title: 'Weather',
      addLocation: 'Add a location to get started.',
      settings: 'Settings',
      feelsLike: 'Feels like',
    },
  },
  de: {
    translation: {
      title: 'Wetter',
      addLocation: 'Fügen Sie einen Ort hinzu, um zu beginnen.',
      settings: 'Einstellungen',
      feelsLike: 'Gefühlt',
    },
  },
};
