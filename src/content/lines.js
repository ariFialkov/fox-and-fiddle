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

/**
 * Rose's conversation: eight beats, from an opener through introductions and small talk to the
 * kind of flirty, slightly dark back-and-forth two people have at a dive bar at 1am.
 * Each beat: her prompt, two things you can say, and her reply to each if the beat survives.
 */
export const ROSE = {
  open: 'You have been staring at me for ten minutes. Say something, or go pick a song.',
  beats: [
    { // 1. the opener
      prompt: 'Well? I am waiting.',
      options: [
        { say: 'Do you believe in love at first sight, or should I walk past again?', reply: 'Walk past again. Slower. I want to see if it was the lighting.' },
        { say: 'I was going to use a line, but you look like someone who has heard them all.', reply: 'All of them. Twice. You get points for noticing, which is more than most of them.' },
      ],
    },
    { // 2. introductions
      prompt: 'Okay. Name. And do not say "whatever you want it to be", I will scream.',
      options: [
        { say: 'I am the guy who just lost at darts to Fergus. That is my whole identity now.', reply: 'Everyone loses to Fergus. He owns the board. Literally, he brought it from home. I am Rose.' },
        { say: 'Most people call me by my name. You can call me when you want a drink.', reply: 'Cheeky. Rose. And I already have a drink, so you will have to try harder.' },
      ],
    },
    { // 3. small talk
      prompt: 'So what brings a guy like you to a place like this on a weeknight?',
      options: [
        { say: 'Low standards and a short walk home. Same as everybody.', reply: 'Honest. I like honest. Honest is rare in here, Sal has been "quitting tomorrow" since 2009.' },
        { say: 'The jukebox. It has the only decent song in town and someone keeps playing the other ones.', reply: 'That someone is me. I am the one playing the other ones. Watch yourself.' },
      ],
    },
    { // 4. flirty small talk
      prompt: 'You are either very confident or very drunk. Which is it?',
      options: [
        { say: 'Confident. The drunk part starts after you say yes to a second drink.', reply: 'Presumptuous. Dee, two more. I want to see what the drunk part looks like.' },
        { say: 'Both. But only one of them is going to remember you tomorrow, so make it count.', reply: 'Ha. That is dark. I like dark. Dark is my whole personality after midnight.' },
      ],
    },
    { // 5. getting personal
      prompt: 'Tell me something real. Something you would not tell Fergus.',
      options: [
        { say: 'I only come here because the silence in my apartment started talking back.', reply: 'Oh no. Oh no, that is the most relatable thing anyone has said to me in months. Keep going.' },
        { say: 'I rehearsed that first line in the bathroom mirror for ten minutes.', reply: 'I know. I could see your lips moving through the gap in the door. It was adorable, in a concerning way.' },
      ],
    },
    { // 6. flirting properly now
      prompt: 'Alright. If you had to describe me in three words, and "beautiful" costs you a finger?',
      options: [
        { say: 'Dangerous. Funny. Taken? Please say no to the last one.', reply: 'Not taken. Was, briefly. He is under the pool table now. Kidding. Mostly.' },
        { say: 'Better than this bar deserves. That is five words, take the extra two fingers.', reply: 'Keep your fingers. You will need them to hold my hand later. Hypothetically.' },
      ],
    },
    { // 7. the real talk
      prompt: 'Last song of the night is coming up. Be honest, what are you hoping happens?',
      options: [
        { say: 'That you let me walk you home and you talk the whole way so I do not have to.', reply: 'I talk a lot. You have been warned. You still look like you mean it, which is the problem.' },
        { say: 'That Mick does not notice I have been talking to you for an hour.', reply: 'Mick noticed forty minutes ago. He is just enjoying watching you sweat. So am I.' },
      ],
    },
    { // 8. the edge
      prompt: 'One more thing and then I decide. Make it good.',
      options: [
        { say: 'I do not know what you are doing tomorrow, but I would like to be the thing you cancel it for.', reply: 'Okay that one got me. Stop. Nobody look at me. Get my coat.' },
        { say: 'My therapist said I should make one brave decision this year. You are it.', reply: 'Your therapist and I are going to get along. Come on, before the lights come up.' },
      ],
    },
  ],
  bad: [
    'Hm. No. You had it and you let it go. Enjoy the rest of your evening. Alone.',
    'Wow. That is the moment, and you threw it in the river. Sal! Is this the guy you were talking about?',
    'I am going to go put on a very long song now, and you are going to stand somewhere else.',
    'And there it is. For a second I thought you were different. Bye.',
  ],
  cashout: [
    'Finally. I thought you would never ask. Grab your coat.',
    'Yes. Before you say another word, yes.',
    'My place has a jukebox with better taste. Let\'s go.',
  ],
  max: 'Honestly, I ran out of comebacks three lines ago. Take me somewhere with less neon.',
  playerCashout: 'Let\'s get outta here.',
};
