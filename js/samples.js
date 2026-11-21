/* Demo complaints covering every category, five languages, vague input and duplicates. */
(function (root) {
  const SAMPLES = [
    { label: "Live wire near school (English)", lang: "en-IN",
      text: "There is an electric wire hanging very low and sparking near the gate of ZP High School, Gandhi Nagar. Children walk under it every morning. Please send someone urgently!" },
    { label: "Pothole on main road (Telugu)", lang: "te-IN",
      text: "రామ్ నగర్ మెయిన్ రోడ్డు మీద పెద్ద గుంత ఉంది, రాత్రి బైక్ వాళ్ళు పడిపోతున్నారు. దయచేసి త్వరగా బాగు చేయండి." },
    { label: "Garbage not collected (Hindi)", lang: "hi-IN",
      text: "शिवाजी कॉलोनी की गली नंबर 2 में तीन दिन से कचरा नहीं उठाया गया है, बहुत बदबू आ रही है और मच्छर बढ़ गए हैं।" },
    { label: "Tree fallen on road (Kannada)", lang: "kn-IN",
      text: "ಬಸ್ ನಿಲ್ದಾಣದ ಹತ್ತಿರ ದೊಡ್ಡ ಮರ ರಸ್ತೆಗೆ ಬಿದ್ದಿದೆ, ವಾಹನಗಳು ಹೋಗಲು ಆಗುತ್ತಿಲ್ಲ." },
    { label: "Drinking-water pipe burst (Tamil)", lang: "ta-IN",
      text: "காந்தி நகர் 3வது தெருவில் குடிநீர் குழாய் உடைந்து இரண்டு நாட்களாக தண்ணீர் வீணாகிறது." },
    { label: "Open manhole near hospital", lang: "en-IN",
      text: "Manhole cover is missing on the road right outside City Hospital, someone will fall in at night." },
    { label: "Drainage overflow (Hinglish)", lang: "en-IN",
      text: "Bhai sector 4 me drainage overflow ho raha hai, road pe ganda paani bhar gaya hai, bahut smell aa rahi hai" },
    { label: "Stray dog bite", lang: "en-IN",
      text: "Stray dogs are chasing children near the park in Ashok Nagar. One child was bitten yesterday." },
    { label: "Vague: streetlight", lang: "en-IN",
      text: "street light not working" },
    { label: "Duplicate of live wire (Telugu)", lang: "te-IN",
      text: "గాంధీ నగర్ జెడ్పీ హైస్కూల్ గేటు దగ్గర కరెంట్ తీగ తెగి కిందకు వేలాడుతోంది, పిల్లలకు ప్రమాదం." },
    { label: "Duplicate of live wire (English)", lang: "en-IN",
      text: "Live wire near ZP High School Gandhi Nagar, kids at risk!!" },
  ];
  root.CL_SAMPLES = SAMPLES;
  if (typeof module !== "undefined") module.exports = SAMPLES;
})(typeof window !== "undefined" ? window : globalThis);
