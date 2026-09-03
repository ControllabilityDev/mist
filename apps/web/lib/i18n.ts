'use client';

import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources } from './translations';

// Two locales. No namespace splitting, no lazy loading, no pluralisation rules
// beyond i18next's defaults.
//
// Note what actually happened here: the dashboard page is a server component and
// cannot import this file at all, so it reads lib/translations.ts directly. The
// i18n library is installed, initialised, and used by exactly one client
// component. The strings would have worked without it.
i18next.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18next;
export { resources };
