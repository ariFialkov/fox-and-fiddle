/** Dialogue for the drinking contest and the pick-up lines game. */

export const DRINKS = [
  { name: 'a pint of lager', pint: true },
  { name: 'a pint of stout', pint: true },
  { name: 'a whiskey, neat', pint: false },
  { name: 'a tequila shot', pint: false },
  { name: 'a rum and coke', pint: true },
  { name: 'a double bourbon', pint: false },
  { name: 'a Long Island iced tea', pint: true },
  { name: 'a flaming sambuca', pint: false },
  { name: 'the house special (do not ask)', pint: false },
  { name: 'whatever is left in the well', pint: true },
];

export const SAL = {
  open: [
    'Sit down, kid. Dee! Two of the usual. Loser pays, and loser is you.',
    'You want to drink with Sal? Sal has been drinking since before you had teeth.',
  ],
  survive: [
    'Damn, you can really throw \'em back.',
    'Alright. Now let\'s start the real drinking.',
    'That one had hair on it and you didn\'t even blink.',
    'Not bad. My ex drank like that. She\'s in Reno now.',
    'Dee, again. The kid thinks this is a game.',
    'I have seen grown men cry at this round.',
    'Your eyes are still pointing the same way. Impressive.',
    'Okay. Okay. I respect that. Next one\'s a doozy.',
    'You know what? I like you. Shame about your liver.',
    'Nobody has ever gotten this far. Not even me, and I\'m still standing.',
  ],
  lose: [
    'And... there he goes. Dee, call the kid a cab.',
    'Lights out. Told you. Sal doesn\'t lose.',
    'Sweet dreams, champ. I\'ll keep your tab warm.',
  ],
  cashout: [
    'Smart. Dumb would have been fun, but smart is good too.',
    'Walking out on your own feet. That\'s a win in this place.',
    'Fine, fine. Same time next week, I\'ll go easy on you.',
  ],
  max: 'You... you drank me under the table. Sal has no words. Sal has no legs. Drinks are on me.',
  playerCashout: 'I know when I\'m beat. I\'m taking "still conscious" as a win.',
  playerDrink: ['Bottoms up.', 'Pour it.', 'Keep \'em coming.', 'Is that all you\'ve got?', 'Another.'],
};

export const ROSE = {
  open: 'You have been staring at me for ten minutes. Say something, or go pick a song.',
  lines: [
    ['Do you believe in love at first sight, or should I walk past again?', 'Is your name Google? Because you have everything I\'ve been searching for.'],
    ['If I said you had a beautiful body, would you hold it against me?', 'I\'m not a photographer, but I can picture us together.'],
    ['Are you a parking ticket? Because you\'ve got "fine" written all over you.', 'Do you have a map? I keep getting lost in your eyes.'],
    ['I was going to say something smooth, but then you smiled and I forgot it.', 'Is it hot in here, or is it just you?'],
    ['My friends bet me I couldn\'t talk to the prettiest girl in the bar. Want to split the winnings?', 'Are you a bank loan? Because you have my interest.'],
    ['I\'m no mathematician, but I\'m pretty good with numbers. Can I have yours?', 'Did it hurt? When you fell from the jukebox? That thing is huge.'],
    ['I\'d say God bless you, but it looks like he already did.', 'Excuse me, do you have a band-aid? I scraped my knee falling for you.'],
    ['Let\'s flip a coin. Heads I\'m yours, tails you\'re mine.', 'Are you French? Because Eiffel for you.'],
  ],
  good: [
    'Oh, that was terrible. I loved it. Keep going.',
    'Okay, that one got me. Don\'t let it go to your head.',
    'Cheesy, confident, and your shirt is tucked in. Two out of three.',
    'Ha! My sister would have slapped you for that. I\'m not my sister.',
    'You are ridiculous. Say another one.',
    'That one is going in my diary. Under "unbelievable".',
    'You know what, I was going to leave. I am no longer leaving.',
    'Stop. No, don\'t stop. Why am I smiling?',
  ],
  bad: [
    'Wow. No. Enjoy the rest of your evening. Alone.',
    'Hm. Sal! Is this the guy you were talking about?',
    'I\'m going to go put on a very long song now.',
    'That was the moment, and you threw it in the river.',
  ],
  cashout: [
    'Finally. I thought you\'d never ask. Grab your coat.',
    'Yes. Before you say another one of those, yes.',
    'My place has a jukebox with better taste. Let\'s go.',
  ],
  max: 'Honestly, I ran out of comebacks three lines ago. Take me somewhere with less neon.',
  playerCashout: 'Let\'s get outta here.',
};
