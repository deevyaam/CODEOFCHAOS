// Source for the Privacy policy, Terms, Legal notice and Delete-your-data pages.
// Rendered in the app (src/app/legal/[doc].tsx) and as plain HTML in public/ on each web build
// (scripts/build-legal.mjs). Tokens like {{CONTACT_EMAIL}} are filled from src/config.ts; values still in
// <ANGLE_BRACKETS> are unconfirmed placeholders and are shown highlighted.
//
// This text is a starting point written for a small community service in Mauritius (Data Protection Act 2017).
// Have it reviewed before publishing. Do not publish it, or any contact detail, without the owner's approval.

export const LEGAL_UPDATED = '13 November 2026';

export type LegalDocId = 'privacy' | 'terms' | 'legal' | 'delete-data';
export type LegalSection = { heading: string; body: string[] };
export type LegalDoc = { id: LegalDocId; title: string; intro: string; sections: LegalSection[] };

export const LEGAL_DOCS: LegalDoc[] = [
  {
    id: 'privacy',
    title: 'Privacy policy',
    intro:
      '{{APP_NAME}} helps people in Mauritius report local problems, follow them and talk to each other. This policy explains what we collect, why, who we share it with and your rights.',
    sections: [
      {
        heading: 'Who is responsible',
        body: [
          'The service is run by {{OPERATOR_NAME}} (the “data controller”). Contact: {{CONTACT_EMAIL}}.',
          'We follow the Mauritius Data Protection Act 2017. You can also contact the Data Protection Office of Mauritius.',
        ],
      },
      {
        heading: 'What we collect',
        body: [
          'Account: your email address, the name you give, and a profile picture, icon or initials if you choose one. If you sign in with Google we receive your name and email from Google.',
          'Guests: a random anonymous account id only. Guests can’t post, and guest assistant chats are not saved.',
          'Reports and comments: what you write, photos and videos you add, the category, and — only if you choose to attach it — the location you pin. You can post reports anonymously: your name is then not shown and not stored with the report.',
          'Discussion messages, reactions, “me too” votes, flags you send and people you block.',
          'Assistant chats (members only), so you can see them again.',
          'Push notifications: this phone’s notification token and the alert area you chose. For “near me” alerts we store an approximate position with that token.',
          'We do not ask for your phone number, address or district, and we do not use advertising or tracking cookies.',
        ],
      },
      {
        heading: 'Why we use it',
        body: [
          'To run the service you asked for: show reports, notify you about updates, and let the community talk (performance of our terms with you).',
          'To keep the service safe: moderation of flagged content and blocking (our legitimate interest in a safe community).',
          'Location is used only when you give it, for the map, weather and alerts (your consent; you can withdraw it in your phone settings).',
        ],
      },
      {
        heading: 'Who we share it with',
        body: [
          'Everyone using the app can see reports (without your name if anonymous), comments and, for members, the Discussion.',
          'If you send a report to an authority, the text and photos you send go to that authority through your own email or share option.',
          'Service providers who process data for us: Supabase (database, storage and sign-in; data region {{DATA_REGION}}), Expo (push notifications), Open-Meteo (weather; receives the coordinates of the place you choose), Google (only if you sign in with Google), and map providers (Google Maps or Apple Maps on phones; OpenStreetMap and Esri on the web).',
          'The assistant runs on Gemma 3, an open AI model, on a server operated by {{OPERATOR_NAME}} or our hosting provider; your questions are sent to it to get an answer and are not used to train it.',
          'Some of these providers are outside Mauritius. We use them only with appropriate safeguards.',
          'We never sell your data.',
        ],
      },
      {
        heading: 'How long we keep it',
        body: [
          'Until you delete it or your account. Deleting your account removes your reports (including anonymous ones you posted), comments, messages, assistant chats, photos and videos.',
          'Server logs kept by our providers are deleted on their normal schedule.',
        ],
      },
      {
        heading: 'Your rights',
        body: [
          'You can access, correct and delete your data, object to processing and ask for a copy. Most of this is in the app (My Account → Delete account). For anything else, write to {{CONTACT_EMAIL}}.',
          'You must be 16 or older to use the app.',
        ],
      },
    ],
  },
  {
    id: 'terms',
    title: 'Terms of use',
    intro: 'By using {{APP_NAME}} you agree to these terms. Please read them.',
    sections: [
      {
        heading: 'The service',
        body: [
          '{{APP_NAME}} is a community tool. It is not an emergency service and not an official channel of any government body. In an emergency call 999 or 112 (police), 114 (ambulance) or 115 (fire).',
          'Statuses such as “Sent to an authority” or “Fixed” are set by reporters, verified authorities or moderators. We don’t guarantee that an authority will act.',
        ],
      },
      {
        heading: 'Who can use it',
        body: ['You must be 16 or older. Keep your sign-in details safe; you are responsible for activity on your account.'],
      },
      {
        heading: 'What you post',
        body: [
          'Post only true, relevant information. Don’t post other people’s personal details, faces or number plates where you can avoid it, insults, hate, threats, spam or anything illegal.',
          'You keep ownership of what you post. You give us permission to show it in the app and on the web so the community and authorities can see it.',
          'Moderators may hide content that breaks these terms, and we may suspend accounts that repeatedly do.',
        ],
      },
      {
        heading: 'The assistant',
        body: ['The assistant uses AI. It can be wrong; check important information with the official source.'],
      },
      {
        heading: 'Liability',
        body: [
          'We provide the service “as is”. To the extent allowed by Mauritian law, we are not liable for content posted by users or for decisions made by authorities.',
          'These terms are governed by the laws of the Republic of Mauritius. Contact: {{CONTACT_EMAIL}}.',
        ],
      },
    ],
  },
  {
    id: 'legal',
    title: 'Legal notice',
    intro: 'Information about who runs {{APP_NAME}}.',
    sections: [
      { heading: 'Operator', body: ['{{OPERATOR_NAME}}', 'Contact: {{CONTACT_EMAIL}}'] },
      { heading: 'Hosting', body: ['App data: Supabase (region {{DATA_REGION}}). Website: Expo Hosting (EAS).'] },
      { heading: 'Credits', body: ['Weather data by Open-Meteo.com (CC BY 4.0). Map data © OpenStreetMap contributors; satellite imagery © Esri. Google Sans font under the SIL Open Font License.'] },
    ],
  },
  {
    id: 'delete-data',
    title: 'Delete your data',
    intro: 'How to delete your account and everything you posted.',
    sections: [
      {
        heading: 'In the app',
        body: [
          'Open Home → My account → Delete account, and confirm. This immediately and permanently removes your account, reports (including anonymous ones you posted), comments, Discussion messages, assistant chats, photos, videos and notification settings.',
        ],
      },
      {
        heading: 'Without the app',
        body: [
          'Write to {{CONTACT_EMAIL}} from the email address of your account and ask us to delete it. We will do so within 30 days and confirm by email.',
        ],
      },
    ],
  },
];

export function legalDoc(id: string) {
  return LEGAL_DOCS.find((d) => d.id === id) ?? null;
}
