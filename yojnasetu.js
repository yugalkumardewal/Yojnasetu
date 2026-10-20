const signupForm = document.querySelector("#signup-form");
const loginForm = document.querySelector("#login-form");
const preferredLanguageStorageKey = "yojnasetu-preferred-language";
const audioLanguageStorageKey = "yojnasetu-audio-language";
const isLocalDevelopmentHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const apiBaseUrl = isLocalDevelopmentHost && window.location.port !== "3000"
    ? `http://${window.location.hostname}:3000`
    : "";

function setupAudioAssistance() {
    const audioLanguage = document.querySelector("#audio-language");
    const audioStatus = document.querySelector("#audio-status");
    if (!audioLanguage || !audioStatus) return;

    const savedAudioLanguage = localStorage.getItem(audioLanguageStorageKey);
    if (savedAudioLanguage && [...audioLanguage.options].some((option) => option.value === savedAudioLanguage)) {
        audioLanguage.value = savedAudioLanguage;
    }
    audioLanguage.addEventListener("change", () => {
        localStorage.setItem(audioLanguageStorageKey, audioLanguage.value);
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        activeButton = null;
        activeUtterance = null;
        document.querySelectorAll("[data-audio-guide], [data-audio-consent], [data-audio-hindi], [data-audio-english]")
            .forEach((button) => button.setAttribute("aria-pressed", "false"));
    });

    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
        audioStatus.textContent = "इस ब्राउज़र में आवाज़ की सुविधा नहीं है। / Audio is not available in this browser.";
        document.querySelectorAll("[data-audio-guide], [data-audio-consent], [data-audio-hindi], [data-audio-english]")
            .forEach((button) => { button.disabled = true; });
        return;
    }

    const guides = {
        login: {
            "hi-IN": "योजना सेतु में आपका स्वागत है। अपना ईमेल और पासवर्ड भरें, फिर साइन इन दबाएं। नया खाता बनाने के लिए खाता बनाएं दबाएं।",
            "en-IN": "Welcome to Yojna Setu. Enter your email and password, then tap Sign in. If you are new, tap Create account."
        },
        signup: {
            "hi-IN": "अपना नाम, ईमेल और देश के कोड के साथ मोबाइल नंबर भरें। पासवर्ड बनाएं और अपनी भाषा चुनें। सहमति को पढ़ें या सुनें। सहमत हों तभी डिब्बे पर निशान लगाएं और खाता बनाएं दबाएं।",
            "en-IN": "Enter your name, email and mobile number with country code. Create a password and choose your language. Read or listen to the consent. Tick the box only if you agree, then tap Create account."
        },
        finder: {
            "hi-IN": "पहले बताएं कि आपको किस मदद की ज़रूरत है। तस्वीर वाले विकल्प दबाएं या सूची से लक्ष्य चुनें। फिर अपने काम का प्रकार चुनें। चाहें तो माइक दबाकर अपनी बात बोलें। योजनाएं देखने के लिए नीचे का बटन दबाएं।",
            "en-IN": "First choose the help you need using a picture button or the list. Choose your type of work. You can tap the microphone and speak about your needs. Tap the button below to see scheme suggestions."
        }
    };

    let activeButton = null;
    let activeUtterance = null;
    document.body.addEventListener("click", (event) => {
        if (!(event.target instanceof Element)) return;
        const button = event.target.closest("[data-audio-guide], [data-audio-consent], [data-audio-hindi], [data-audio-english]");
        if (!button) return;

        if (activeButton === button) {
            window.speechSynthesis.cancel();
            button.setAttribute("aria-pressed", "false");
            activeButton = null;
            activeUtterance = null;
            audioStatus.textContent = "आवाज़ रोक दी गई। / Audio stopped.";
            return;
        }

        window.speechSynthesis.cancel();
        document.querySelectorAll("[data-audio-guide], [data-audio-consent], [data-audio-hindi], [data-audio-english]")
            .forEach((item) => item.setAttribute("aria-pressed", "false"));

        const language = audioLanguage.value;
        let text = button.dataset[`audio${language === "hi-IN" ? "Hindi" : "English"}`];
        if (button.hasAttribute("data-audio-guide")) text = guides[button.dataset.audioGuide]?.[language];
        if (button.hasAttribute("data-audio-consent")) {
            const consent = document.querySelector(".consent-option span")?.textContent || "";
            text = consent.split(" / ")[language === "hi-IN" ? 0 : 1]?.trim();
        }
        if (!text) return;

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = language;
        const voice = window.speechSynthesis.getVoices()
            .find((item) => item.lang.toLowerCase().startsWith(language.slice(0, 2).toLowerCase()));
        if (voice) utterance.voice = voice;
        activeButton = button;
        activeUtterance = utterance;
        button.setAttribute("aria-pressed", "true");
        audioStatus.textContent = language === "hi-IN" ? "सुनिए… / Playing audio." : "Playing audio…";
        utterance.onend = () => {
            if (activeUtterance !== utterance) return;
            button.setAttribute("aria-pressed", "false");
            activeButton = null;
            activeUtterance = null;
            audioStatus.textContent = "पूरा हुआ / Finished.";
        };
        utterance.onerror = () => {
            if (activeUtterance !== utterance) return;
            button.setAttribute("aria-pressed", "false");
            activeButton = null;
            activeUtterance = null;
            audioStatus.textContent = "आवाज़ नहीं चल पाई। डिवाइस की आवाज़ जांचें। / Audio could not play. Check your device audio.";
        };
        window.speechSynthesis.speak(utterance);
    });
}

setupAudioAssistance();

async function apiRequest(url, options = {}) {
    let response;
    try {
        response = await fetch(`${apiBaseUrl}${url}`, {
            ...options,
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                ...options.headers
            }
        });
    } catch (error) {
        throw new Error("Cannot reach the Yojna Setu backend. Start it with npm start in the project folder; it should be available at http://localhost:3000.");
    }

    const responseText = await response.text();
    const contentType = response.headers.get("content-type") || "";
    let result;
    if (!responseText.trim()) {
        if (response.status === 405) {
            throw new Error("This web server does not handle Yojna Setu API requests. Start the backend with npm start and refresh the page.");
        }
        throw new Error(`The server returned an empty response (HTTP ${response.status}). Check that Yojna Setu's backend is running.`);
    }
    if (!contentType.toLowerCase().includes("application/json")) {
        throw new Error(`The server returned a non-JSON response (HTTP ${response.status}). Check that the Yojna Setu backend is running.`);
    }
    try {
        result = JSON.parse(responseText);
    } catch (error) {
        console.error("The server returned malformed JSON.", error);
        throw new Error(`The server returned invalid JSON (HTTP ${response.status}). Check the backend logs and try again.`);
    }
    if (!result || typeof result !== "object" || Array.isArray(result)) {
        throw new Error(`The server returned an invalid response (HTTP ${response.status}). Check the backend logs and try again.`);
    }
    if (!response.ok) {
        const error = new Error(typeof result.error === "string"
            ? result.error
            : `The server could not complete your request (HTTP ${response.status}).`);
        error.status = response.status;
        error.retryAfter = result.retryAfter;
        error.resendLimitReached = result.resendLimitReached;
        throw error;
    }
    return result;
}

if (loginForm) {
    const submitButton = loginForm.querySelector('button[type="submit"]');
    const status = document.querySelector("#login-status");
    const loginEmail = document.querySelector("#email");
    const loginPassword = document.querySelector("#password");
    const destinations = new Set(["business-schemes.html"]);

    function openSchemeFinder() {
        const requestedPage = new URLSearchParams(window.location.search).get("next");
        const destination = destinations.has(requestedPage) ? requestedPage : "business-schemes.html";
        window.location.replace(`${apiBaseUrl}/${destination}`);
    }

    apiRequest("/api/session")
        .then(openSchemeFinder)
        .catch((error) => {
            if (error.status !== 401) status.textContent = error.message;
        });

    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!loginForm.reportValidity()) return;

        submitButton.disabled = true;
        status.textContent = "Signing in…";
        try {
            await apiRequest("/api/login", {
                method: "POST",
                body: JSON.stringify({
                    email: loginEmail.value.trim().toLowerCase(),
                    password: loginPassword.value
                })
            });
            openSchemeFinder();
        } catch (error) {
            status.textContent = error.message;
            submitButton.disabled = false;
        }
    });
}

if (signupForm) {
    const submitButton = signupForm.querySelector('button[type="submit"]');
    const status = document.querySelector("#signup-status");
    const languageSelect = document.querySelector("#preferred-language");
    const savedLanguage = localStorage.getItem(preferredLanguageStorageKey);
    if (savedLanguage && [...languageSelect.options].some((option) => option.value === savedLanguage)) {
        languageSelect.value = savedLanguage;
    }

    signupForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!signupForm.reportValidity()) return;

        const formData = new FormData(signupForm);
        const payload = Object.fromEntries(formData.entries());
        payload.name = String(payload.name).trim();
        payload.email = String(payload.email).trim().toLowerCase();
        payload.phone = String(payload.phone).trim();
        payload.consent = formData.get("consent") === "yes";

        submitButton.disabled = true;
        status.textContent = "Creating your account…";
        try {
            const result = await apiRequest("/api/signup", {
                method: "POST",
                body: JSON.stringify(payload)
            });
            localStorage.setItem(preferredLanguageStorageKey, result.preferredLanguage);
            status.textContent = "Account created. Opening scheme recommendations…";
            window.location.href = `${apiBaseUrl}/business-schemes.html`;
        } catch (error) {
            status.textContent = error.message;
            submitButton.disabled = false;
        }
    });
}

const businessFinderForm = document.querySelector("#business-finder-form");

if (businessFinderForm) {
    const profileCard = document.querySelector("#account-profile");
    const profileName = document.querySelector("#profile-name");
    const profileAvatar = document.querySelector("#profile-avatar");
    const profileAccountId = document.querySelector("#profile-account-id");
    const profileEmail = document.querySelector("#profile-email");
    const profilePhone = document.querySelector("#profile-phone");
    const profileLanguage = document.querySelector("#profile-language");
    const profileCreated = document.querySelector("#profile-created");
    const logoutButton = document.querySelector("#logout-button");
    const profileStatus = document.querySelector("#profile-status");

    apiRequest("/api/session")
        .then((profile) => {
            profileName.textContent = profile.name;
            profileAvatar.textContent = profile.name
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0].toLocaleUpperCase())
                .join("");
            profileAccountId.textContent = profile.accountId;
            profileEmail.textContent = profile.email;
            profilePhone.textContent = profile.phone;
            profileLanguage.textContent = profile.preferredLanguage;
            profileCreated.textContent = new Intl.DateTimeFormat(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric"
            }).format(new Date(profile.createdAt));
            profileCard.hidden = false;
        })
        .catch((error) => {
            if (error.status === 401) {
                window.location.replace("/yojnasetu.html?next=business-schemes.html");
                return;
            }
            profileStatus.textContent = error.message;
            profileCard.hidden = false;
        });

    logoutButton.addEventListener("click", async () => {
        logoutButton.disabled = true;
        try {
            await apiRequest("/api/logout", { method: "POST", body: "{}" });
            window.location.replace("/yojnasetu.html");
        } catch (error) {
            profileStatus.textContent = error.message;
            logoutButton.disabled = false;
        }
    });

    const goalSelect = document.querySelector("#business-goal");
    const followup = document.querySelector("#goal-followup");
    const followupLabel = document.querySelector("#followup-label");
    const detailSelect = document.querySelector("#goal-detail");
    const results = document.querySelector("#scheme-results");
    const voiceButton = document.querySelector("#voice-input-button");
    const voiceLanguage = document.querySelector("#voice-language");
    const voiceStatus = document.querySelector("#voice-status");
    const businessQuery = document.querySelector("#business-query");
    const languagePrompt = document.querySelector("#finder-language-prompt");
    const submitButton = businessFinderForm.querySelector('button[type="submit"]');
    const savedLanguage = localStorage.getItem(preferredLanguageStorageKey);
    if (savedLanguage && [...voiceLanguage.options].some((option) => option.value === savedLanguage)) {
        voiceLanguage.value = savedLanguage;
    }
    const languagePrompts = {
        "as-IN": "আপোনাৰ ব্যৱসায় আৰু কি সহায় লাগে সেই বিষয়ে কওক।",
        "bn-IN": "আপনার ব্যবসা ও কী সাহায্য দরকার, তা বলুন।",
        "brx-IN": "नोंथांनि बेवसाय आरो माबोरै मदद लागो, बेखौ बुं।",
        "doi-IN": "अपने कारोबार ते केह् मदद चाहीदी ऐ, दस्सो।",
        "en-IN": "Tell us about your business and what help you need.",
        "gu-IN": "તમારા ધંધા અને તમને કઈ મદદ જોઈએ છે તે જણાવો.",
        "hi-IN": "अपने कारोबार और आपको किस मदद की ज़रूरत है, बताएं।",
        "kn-IN": "ನಿಮ್ಮ ವ್ಯಾಪಾರ ಮತ್ತು ನಿಮಗೆ ಬೇಕಾದ ಸಹಾಯದ ಬಗ್ಗೆ ತಿಳಿಸಿ.",
        "ks-IN": "پنٛنِس کاروبار تہٕ ضروٗری مددہٕ بارے وٲتھ",
        "kok-IN": "तुमच्या धंद्या विशीं आनी तुमका खंयची मदत जाय तें सांगात.",
        "mai-IN": "अपन कारोबार आ अहाँकेँ कोन मदतिक जरूरत अछि, से बताउ.",
        "ml-IN": "നിങ്ങളുടെ ബിസിനസിനെക്കുറിച്ചും എന്ത് സഹായമാണ് വേണ്ടതെന്നും പറയൂ.",
        "mni-IN": "নহাক্কী বিজিনেস অমসুং করিগুম্বা মতমদা মদুং পাম্বগে হায়বদু হায়বিয়ু।",
        "mr-IN": "तुमच्या व्यवसायाबद्दल आणि कोणती मदत हवी आहे ते सांगा.",
        "ne-IN": "आफ्नो व्यवसाय र कस्तो सहयोग चाहिन्छ भन्नुहोस्।",
        "or-IN": "ଆପଣଙ୍କ ବ୍ୟବସାୟ ଓ କେଉଁ ସହାୟତା ଦରକାର କୁହନ୍ତୁ।",
        "pa-IN": "ਆਪਣੇ ਕਾਰੋਬਾਰ ਅਤੇ ਤੁਹਾਨੂੰ ਕਿਹੜੀ ਮਦਦ ਚਾਹੀਦੀ ਹੈ, ਦੱਸੋ।",
        "sa-IN": "भवतः व्यवसायस्य आवश्यकसाहाय्यस्य च विषये वदतु।",
        "sat-IN": "ᱟᱢᱟᱜ ᱵᱮᱵᱚᱥᱛᱷᱟ ᱟᱨ ᱪᱮᱫ ᱜᱚᱲᱚ ᱞᱟᱹᱠᱛᱤ ᱭᱟᱹ ᱩᱫᱩᱜ ᱢᱮ।",
        "sd-IN": "پنهنجي ڪاروبار ۽ گهربل مدد بابت ٻڌايو.",
        "ta-IN": "உங்கள் வணிகம் மற்றும் உங்களுக்கு என்ன உதவி தேவை என்பதைச் சொல்லுங்கள்.",
        "te-IN": "మీ వ్యాపారం గురించి, మీకు ఎలాంటి సహాయం కావాలో చెప్పండి.",
        "ur-IN": "اپنے کاروبار اور آپ کو کس مدد کی ضرورت ہے، بتائیں۔"
    };
    const resultCopy = {
        "as-IN": { found: "{count}খন আঁচনি পোৱা গ'ল", none: "ওচৰৰ কোনো আঁচনি পোৱা নগ'ল", tryAgain: "আন এটা সহজ বৰ্ণনা লিখক বা বেলেগ শ্ৰেণী বাছনি কৰক।", fallback: "এই তালিকাত মিল থকা আঁচনি নাই। myScheme-ত আন কেন্দ্ৰীয় আৰু ৰাজ্যিক আঁচনি বিচাৰক।", official: "চৰকাৰী উৎস", why: "কিয় দেখুওৱা হৈছে?", goal: "আপোনাৰ লক্ষ্য", business: "আপোনাৰ ব্যৱসায়", description: "আপোনাৰ বৰ্ণনা", answer: "আপোনাৰ উত্তৰ", search: "আঁচনি বিচৰা", link: "চৰকাৰী ৱেবছাইট চাওক ↗", disclaimer: "এইটো প্ৰাৰম্ভিক তথ্যহে, অনুমোদন নহয়। বৰ্তমানৰ নিয়ম চৰকাৰী ৱেবছাইটত পৰীক্ষা কৰক।", directory: "myScheme.gov.in-ত কেন্দ্ৰীয় আৰু ৰাজ্যিক আঁচনি বিচাৰক ↗", credit: "JanSamarth-ত ঋণ-সংলগ্ন আঁচনি ↗", footer: "চূড়ান্ত যোগ্যতা আৰু আবেদন চৰকাৰী পৰ্টেলত পৰীক্ষা কৰক।" },
        "bn-IN": { found: "{count}টি প্রকল্প পাওয়া গেছে", none: "কাছাকাছি কোনো প্রকল্প পাওয়া যায়নি", tryAgain: "আরও সহজভাবে লিখুন অথবা অন্য বিভাগ বেছে নিন।", fallback: "এই তালিকায় মিল পাওয়া যায়নি। myScheme-এ অন্য কেন্দ্রীয় ও রাজ্য প্রকল্প খুঁজুন।", official: "সরকারি উৎস", why: "কেন দেখানো হয়েছে?", goal: "আপনার লক্ষ্য", business: "আপনার ব্যবসা", description: "আপনার বিবরণ", answer: "আপনার উত্তর", search: "প্রকল্প অনুসন্ধান", link: "সরকারি ওয়েবসাইট দেখুন ↗", disclaimer: "এটি প্রাথমিক তথ্য, অনুমোদন নয়। সরকারি ওয়েবসাইটে বর্তমান নিয়ম যাচাই করুন।", directory: "myScheme.gov.in-এ কেন্দ্রীয় ও রাজ্য প্রকল্প খুঁজুন ↗", credit: "JanSamarth-এ ঋণ-সংযুক্ত প্রকল্প ↗", footer: "চূড়ান্ত যোগ্যতা ও আবেদন সরকারি পোর্টালে যাচাই করুন।" },
        "brx-IN": { found: "{count} योजना नागिरनाय", none: "सोमोन्दै योजना मोनाखै", tryAgain: "गोरोन्थि गोनां सोलायनाय बाहाय एबा गुबुन थाखोखौ सायख।", fallback: "बे लिस्टआव गोरोबनाय योजना मोनाखै। myScheme आव गुबुन केन्द्र आरो राज्यनि योजना नागिर।", official: "सरकारि फुंखा", why: "माबोरनो दिन्थिबाय?", goal: "नोंथांनि थांखि", business: "नोंथांनि बेवसाय", description: "नोंथांनि बेखेवथि", answer: "नोंथांनि फिननाय", search: "योजना नागिरनाय", link: "सरकारि वेबसाइट नाय ↗", disclaimer: "बेयो गिबि फोरमायथि, मंजुरि नङा। सरकारि वेबसाइटआव दानि नियमखौ आनजाद खालाम।", directory: "myScheme.gov.in आव केन्द्र आरो राज्यनि योजना नागिर ↗", credit: "JanSamarth आव लोन-गोहोमना थानाय योजना ↗", footer: "जोबथा पात्रता आरो आवेदनखौ सरकारि पोर्टलआव आनजाद खालाम।" },
        "doi-IN": { found: "{count} स्कीमां लब्भियां", none: "नेड़े दी कोई स्कीम नेईं लब्भी", tryAgain: "होर सादे शब्दें च लिखो जां दूई श्रेणी चुनो।", fallback: "इस सूची च मेल खंदी स्कीम नेईं। myScheme पर होर केंद्रीय ते राज्य स्कीमां खोजो।", official: "सरकारी स्रोत", why: "एह् कशा दस्सेआ?", goal: "तुंदा लक्ष्य", business: "तुंदा कारोबार", description: "तुंदा ब्यौरा", answer: "तुंदा जवाब", search: "स्कीम खोज", link: "सरकारी वेबसाइट पर दिक्खो ↗", disclaimer: "एह् शुरुआती जानकारी ऐ, मंजूरी नेईं। मौजूदा नियम सरकारी वेबसाइट पर जांचो।", directory: "myScheme.gov.in पर केंद्रीय ते राज्य स्कीमां खोजो ↗", credit: "JanSamarth पर कर्ज़-आधारित स्कीमां ↗", footer: "अंतिम पात्रता ते आवेदन सरकारी पोर्टल पर जांचो।" },
        "gu-IN": { found: "{count} યોજનાઓ મળી", none: "નજીકની કોઈ યોજના મળી નથી", tryAgain: "બીજા સરળ શબ્દોમાં લખો અથવા બીજી શ્રેણી પસંદ કરો.", fallback: "આ યાદીમાં મેળ ખાતી યોજના મળી નથી. myScheme પર અન્ય કેન્દ્ર અને રાજ્ય યોજનાઓ શોધો.", official: "સત્તાવાર સ્ત્રોત", why: "શા માટે બતાવ્યું?", goal: "તમારો હેતુ", business: "તમારો વ્યવસાય", description: "તમારું વર્ણન", answer: "તમારો જવાબ", search: "યોજના શોધ", link: "સત્તાવાર વેબસાઇટ જુઓ ↗", disclaimer: "આ પ્રારંભિક માહિતી છે, મંજૂરી નથી. વર્તમાન નિયમો સત્તાવાર વેબસાઇટ પર તપાસો.", directory: "myScheme.gov.in પર કેન્દ્ર અને રાજ્ય યોજનાઓ શોધો ↗", credit: "JanSamarth પર લોન-સંલગ્ન યોજનાઓ ↗", footer: "અંતિમ પાત્રતા અને અરજી સત્તાવાર પોર્ટલ પર તપાસો." },
        "hi-IN": { found: "{count} योजनाएं मिलीं", none: "कोई नज़दीकी योजना नहीं मिली", tryAgain: "आसान शब्दों में बताएं या दूसरी श्रेणी चुनें।", fallback: "इस सूची में मेल नहीं मिला। myScheme पर दूसरी केंद्रीय और राज्य योजनाएं खोजें।", official: "सरकारी स्रोत", why: "क्यों दिखाया?", goal: "आपका लक्ष्य", business: "आपका काम", description: "आपकी बताई बात", answer: "आपका जवाब", search: "योजना खोज", link: "सरकारी वेबसाइट पर देखें ↗", disclaimer: "यह शुरुआती जानकारी है, मंजूरी नहीं। मौजूदा नियम सरकारी वेबसाइट पर जांचें।", directory: "myScheme.gov.in पर केंद्र और राज्य की योजनाएं खोजें ↗", credit: "JanSamarth पर कर्ज़ वाली योजनाएं ↗", footer: "अंतिम पात्रता और आवेदन सरकारी पोर्टल पर जांचें।" },
        "kn-IN": { found: "{count} ಯೋಜನೆಗಳು ದೊರೆತಿವೆ", none: "ಹತ್ತಿರದ ಯಾವುದೇ ಯೋಜನೆ ಕಂಡುಬಂದಿಲ್ಲ", tryAgain: "ಸರಳವಾಗಿ ಮತ್ತೊಮ್ಮೆ ಬರೆಯಿರಿ ಅಥವಾ ಬೇರೆ ವರ್ಗವನ್ನು ಆಯ್ಕೆಮಾಡಿ.", fallback: "ಈ ಪಟ್ಟಿಯಲ್ಲಿ ಹೊಂದಾಣಿಕೆಯ ಯೋಜನೆ ಇಲ್ಲ. myScheme ನಲ್ಲಿ ಇತರ ಕೇಂದ್ರ ಮತ್ತು ರಾಜ್ಯ ಯೋಜನೆಗಳನ್ನು ಹುಡುಕಿ.", official: "ಅಧಿಕೃತ ಮೂಲ", why: "ಏಕೆ ತೋರಿಸಲಾಗಿದೆ?", goal: "ನಿಮ್ಮ ಗುರಿ", business: "ನಿಮ್ಮ ವ್ಯಾಪಾರ", description: "ನಿಮ್ಮ ವಿವರಣೆ", answer: "ನಿಮ್ಮ ಉತ್ತರ", search: "ಯೋಜನೆ ಹುಡುಕಾಟ", link: "ಅಧಿಕೃತ ವೆಬ್‌ಸೈಟ್ ನೋಡಿ ↗", disclaimer: "ಇದು ಪ್ರಾಥಮಿಕ ಮಾಹಿತಿ, ಅನುಮೋದನೆ ಅಲ್ಲ. ಪ್ರಸ್ತುತ ನಿಯಮಗಳನ್ನು ಅಧಿಕೃತ ವೆಬ್‌ಸೈಟ್‌ನಲ್ಲಿ ಪರಿಶೀಲಿಸಿ.", directory: "myScheme.gov.in ನಲ್ಲಿ ಕೇಂದ್ರ ಮತ್ತು ರಾಜ್ಯ ಯೋಜನೆಗಳನ್ನು ಹುಡುಕಿ ↗", credit: "JanSamarth ನಲ್ಲಿ ಸಾಲ-ಸಂಬಂಧಿತ ಯೋಜನೆಗಳು ↗", footer: "ಅಂತಿಮ ಅರ್ಹತೆ ಮತ್ತು ಅರ್ಜಿಯನ್ನು ಅಧಿಕೃತ ಪೋರ್ಟಲ್‌ನಲ್ಲಿ ಪರಿಶೀಲಿಸಿ." },
        "ks-IN": { found: "{count} سکیمہٕ لَبھِ", none: "نَزدیٖک کانٛہہ سکیمہٕ نَہ لَبھِ", tryAgain: "آسان لفظن منٛز دوبارٕ لیکھو یا بیٚیہِ زمرٕ ژٲریو۔", fallback: "یِمِس فہرستَس منٛز مِلَن واجنٕ سکیمہٕ چھُنہٕ۔ myScheme پٮ۪ٹھ بیٚیہِ مرکزی تہٕ ریاستی سکیمہٕ وُچھو۔", official: "سرکاری ذٔریعہٕ", why: "کِتھ پٲٹھۍ دِکھاونہٕ؟", goal: "تُہُند مقصد", business: "تُہُند کاروبار", description: "تُہُند بیان", answer: "تُہُند جواب", search: "سکیمہٕ تلاش", link: "سرکاری ویب سایٹ وُچھو ↗", disclaimer: "یہ چھِ شروعاتی معلومات، منظوری نَہ۔ تازٕ قاعدٕ سرکاری ویب سایٹ پٮ۪ٹھ جانچو۔", directory: "myScheme.gov.in پٮ۪ٹھ مرکزی تہٕ ریاستی سکیمہٕ تلاش کٔریو ↗", credit: "JanSamarth پٮ۪ٹھ قرضٕ سٟتۍ وابستہ سکیمہٕ ↗", footer: "آخری اہلیت تہٕ درخواست سرکاری پورٹل پٮ۪ٹھ جانچو۔" },
        "kok-IN": { found: "{count} येवजण्यो मेळ्ळ्यो", none: "लागीं येवजण मेळ्ळी ना", tryAgain: "सोप्या उतरांनी परत सांगात वा दुसरो विभाग निवडात.", fallback: "ह्या वळेरेंत जुळपी येवजण मेळ्ळी ना. myScheme चेर हेर केंद्र आनी राज्य येवजण्यो सोदात.", official: "सरकारी स्रोत", why: "कित्याक दाखयलें?", goal: "तुमचें ध्येय", business: "तुमचो वेवसाय", description: "तुमचें वर्णन", answer: "तुमचें जाप", search: "येवजण सोद", link: "सरकारी संकेतथळ पळयात ↗", disclaimer: "ही सुरवातीची म्हायती, मंजुरी न्हय. आताचे नियम सरकारी संकेतथळार तपासात.", directory: "myScheme.gov.in चेर केंद्र आनी राज्य येवजण्यो सोदात ↗", credit: "JanSamarth चेर कर्जाशी जोडिल्ल्यो येवजण्यो ↗", footer: "शेवटची पात्रताय आनी अर्ज सरकारी पोर्टलार तपासात." },
        "mai-IN": { found: "{count} योजना भेटल", none: "नजदीकक कोनो योजना नहि भेटल", tryAgain: "सरल शब्दमे फेर लिखू अथवा दोसर श्रेणी चुनू।", fallback: "एहि सूचीमे मेल खाइत योजना नहि भेटल। myScheme पर दोसर केंद्रीय आ राज्य योजना ताकू।", official: "सरकारी स्रोत", why: "कियैक देखाओल गेल?", goal: "अहाँक लक्ष्य", business: "अहाँक कारोबार", description: "अहाँक विवरण", answer: "अहाँक उत्तर", search: "योजना खोज", link: "सरकारी वेबसाइट देखू ↗", disclaimer: "ई शुरुआती जानकारी अछि, मंजूरी नहि। वर्तमान नियम सरकारी वेबसाइट पर जाँचू।", directory: "myScheme.gov.in पर केंद्र आ राज्यक योजना ताकू ↗", credit: "JanSamarth पर ऋण-संबंधित योजना ↗", footer: "अंतिम पात्रता आ आवेदन सरकारी पोर्टल पर जाँचू।" },
        "ml-IN": { found: "{count} പദ്ധതികൾ കണ്ടെത്തി", none: "സമീപമുള്ള പദ്ധതികളൊന്നും കണ്ടെത്തിയില്ല", tryAgain: "മറ്റൊരു ലളിതമായ വിവരണം നൽകുകയോ വേറൊരു വിഭാഗം തിരഞ്ഞെടുക്കുകയോ ചെയ്യുക.", fallback: "ഈ പട്ടികയിൽ അനുയോജ്യമായ പദ്ധതി കണ്ടെത്തിയില്ല. myScheme-ൽ മറ്റ് കേന്ദ്ര, സംസ്ഥാന പദ്ധതികൾ തിരയാം.", official: "ഔദ്യോഗിക ഉറവിടം", why: "എന്തുകൊണ്ട് ഇത് കാണിക്കുന്നു?", goal: "നിങ്ങളുടെ ലക്ഷ്യം", business: "നിങ്ങളുടെ ബിസിനസ്", description: "നിങ്ങളുടെ വിവരണം", answer: "നിങ്ങളുടെ മറുപടി", search: "പദ്ധതി തിരയൽ", link: "ഔദ്യോഗിക വെബ്സൈറ്റ് കാണുക ↗", disclaimer: "ഇത് പ്രാഥമിക വിവരങ്ങൾ മാത്രമാണ്, അംഗീകാരമല്ല. നിലവിലെ നിബന്ധനകൾ ഔദ്യോഗിക വെബ്സൈറ്റിൽ പരിശോധിക്കുക.", directory: "myScheme.gov.in-ൽ കേന്ദ്ര, സംസ്ഥാന പദ്ധതികൾ തിരയുക ↗", credit: "JanSamarth-ൽ വായ്പയുമായി ബന്ധിപ്പിച്ച പദ്ധതികൾ ↗", footer: "അന്തിമ യോഗ്യതയും അപേക്ഷയും ഔദ്യോഗിക സർക്കാർ പോർട്ടലിൽ പരിശോധിക്കുക." },
        "mni-IN": { found: "{count} ꯌꯥꯝꯅ ꯐꯪꯈ꯭ꯔꯦ", none: "ꯅꯛꯅꯥ ꯂꯩꯕ ꯁꯤꯃꯤꯌꯣꯖꯅ ꯑꯃꯠꯇ ꯐꯪꯗꯦ", tryAgain: "ꯑꯇꯣꯞꯄ ꯑꯔꯥꯝꯕ ꯋꯥꯍꯩꯅ ꯍꯥꯌꯕꯤꯌꯨ ꯅꯠꯔꯒ ꯑꯇꯣꯞꯄ ꯃꯈꯜ ꯈꯜꯂꯨ।", fallback: "ꯃꯁꯤꯒꯤ ꯂꯤꯁꯇꯇ ꯃꯥꯟꯅꯕ ꯁꯤꯃꯤ ꯐꯪꯗꯦ। myScheme ꯗ ꯑꯇꯣꯞꯄ ꯀꯦꯟꯗ꯭ꯔ ꯑꯃꯁꯨꯡ ꯔꯥꯖ꯭ꯌꯀꯤ ꯁꯤꯃꯤ ꯌꯥꯡꯉꯨ।", official: "ꯁꯔꯀꯥꯔꯒꯤ ꯈꯨꯠꯂꯥꯌ", why: "ꯀꯔꯤꯒꯤꯗꯃꯛ ꯎꯠꯂꯤ?", goal: "ꯅꯍꯥꯛꯀꯤ ꯄꯥꯟꯗꯝ", business: "ꯅꯍꯥꯛꯀꯤ ꯕꯤꯖꯤꯅꯦꯁ", description: "ꯅꯍꯥꯛꯀꯤ ꯋꯥꯔꯣꯜ", answer: "ꯅꯍꯥꯛꯀꯤ ꯄꯥꯎ", search: "ꯁꯤꯃꯤ ꯌꯥꯡꯕ", link: "ꯁꯔꯀꯥꯔꯒꯤ ꯋꯦꯕꯁꯥꯏꯠ ꯌꯦꯡꯉꯨ ↗", disclaimer: "ꯃꯁꯤ ꯑꯍꯥꯟꯕ ꯋꯥꯔꯣꯜꯅꯤ, ꯑꯌꯥꯕ ꯅꯠꯇꯦ। ꯁꯔꯀꯥꯔꯒꯤ ꯋꯦꯕꯁꯥꯏꯠꯇ ꯍꯧꯖꯤꯛꯀꯤ ꯅꯤꯌꯃ ꯌꯦꯡꯉꯨ।", directory: "myScheme.gov.in ꯗ ꯀꯦꯟꯗ꯭ꯔ ꯑꯃꯁꯨꯡ ꯔꯥꯖ꯭ꯌꯀꯤ ꯁꯤꯃꯤ ꯌꯥꯡꯉꯨ ↗", credit: "JanSamarth ꯗ ꯂꯣꯟꯒ ꯃꯔꯤ ꯂꯩꯅꯕ ꯁꯤꯃꯤ ↗", footer: "ꯑꯔꯣꯏꯕ ꯑꯔꯤꯌꯥꯕ ꯑꯃꯁꯨꯡ ꯑꯔꯖꯤ ꯁꯔꯀꯥꯔꯒꯤ ꯄꯣꯔꯇꯦꯜꯇ ꯌꯦꯡꯉꯨ।" },
        "mr-IN": { found: "{count} योजना आढळल्या", none: "जवळची कोणतीही योजना आढळली नाही", tryAgain: "सोप्या शब्दांत पुन्हा लिहा किंवा दुसरा विभाग निवडा.", fallback: "या यादीत जुळणारी योजना नाही. myScheme वर इतर केंद्र आणि राज्य योजना शोधा.", official: "अधिकृत स्रोत", why: "का दाखवले?", goal: "तुमचे ध्येय", business: "तुमचा व्यवसाय", description: "तुमचे वर्णन", answer: "तुमचे उत्तर", search: "योजना शोध", link: "अधिकृत संकेतस्थळ पहा ↗", disclaimer: "ही प्राथमिक माहिती आहे, मंजुरी नाही. सध्याचे नियम अधिकृत संकेतस्थळावर तपासा.", directory: "myScheme.gov.in वर केंद्र आणि राज्य योजना शोधा ↗", credit: "JanSamarth वरील कर्ज-संलग्न योजना ↗", footer: "अंतिम पात्रता आणि अर्ज अधिकृत पोर्टलवर तपासा." },
        "ne-IN": { found: "{count} वटा योजना भेटिए", none: "नजिकको कुनै योजना भेटिएन", tryAgain: "सरल शब्दमा फेरि लेख्नुहोस् वा अर्को श्रेणी छान्नुहोस्।", fallback: "यस सूचीमा मिल्ने योजना भेटिएन। myScheme मा अन्य केन्द्र र राज्यका योजना खोज्नुहोस्।", official: "आधिकारिक स्रोत", why: "किन देखाइएको?", goal: "तपाईंको लक्ष्य", business: "तपाईंको व्यवसाय", description: "तपाईंको विवरण", answer: "तपाईंको जवाफ", search: "योजना खोज", link: "आधिकारिक वेबसाइट हेर्नुहोस् ↗", disclaimer: "यो प्रारम्भिक जानकारी हो, स्वीकृति होइन। हालका नियम आधिकारिक वेबसाइटमा जाँच गर्नुहोस्।", directory: "myScheme.gov.in मा केन्द्र र राज्यका योजना खोज्नुहोस् ↗", credit: "JanSamarth मा ऋण-सम्बन्धित योजना ↗", footer: "अन्तिम योग्यता र आवेदन आधिकारिक पोर्टलमा जाँच गर्नुहोस्।" },
        "or-IN": { found: "{count}ଟି ଯୋଜନା ମିଳିଲା", none: "ନିକଟର କୌଣସି ଯୋଜନା ମିଳିଲା ନାହିଁ", tryAgain: "ସରଳ ଶବ୍ଦରେ ପୁଣି ଲେଖନ୍ତୁ କିମ୍ବା ଅନ୍ୟ ବର୍ଗ ବାଛନ୍ତୁ।", fallback: "ଏହି ତାଲିକାରେ ମେଳ ଖାଉଥିବା ଯୋଜନା ନାହିଁ। myScheme ରେ ଅନ୍ୟ କେନ୍ଦ୍ର ଓ ରାଜ୍ୟ ଯୋଜନା ଖୋଜନ୍ତୁ।", official: "ସରକାରୀ ଉତ୍ସ", why: "କାହିଁକି ଦେଖାଯାଇଛି?", goal: "ଆପଣଙ୍କ ଲକ୍ଷ୍ୟ", business: "ଆପଣଙ୍କ ବ୍ୟବସାୟ", description: "ଆପଣଙ୍କ ବର୍ଣ୍ଣନା", answer: "ଆପଣଙ୍କ ଉତ୍ତର", search: "ଯୋଜନା ଖୋଜ", link: "ସରକାରୀ ୱେବସାଇଟ୍ ଦେଖନ୍ତୁ ↗", disclaimer: "ଏହା ପ୍ରାରମ୍ଭିକ ସୂଚନା, ଅନୁମୋଦନ ନୁହେଁ। ବର୍ତ୍ତମାନର ନିୟମ ସରକାରୀ ୱେବସାଇଟ୍‌ରେ ଯାଞ୍ଚ କରନ୍ତୁ।", directory: "myScheme.gov.in ରେ କେନ୍ଦ୍ର ଓ ରାଜ୍ୟ ଯୋଜନା ଖୋଜନ୍ତୁ ↗", credit: "JanSamarth ରେ ଋଣ-ସଂଯୁକ୍ତ ଯୋଜନା ↗", footer: "ଚୂଡ଼ାନ୍ତ ଯୋଗ୍ୟତା ଓ ଆବେଦନ ସରକାରୀ ପୋର୍ଟାଲ୍‌ରେ ଯାଞ୍ଚ କରନ୍ତୁ।" },
        "pa-IN": { found: "{count} ਯੋਜਨਾਵਾਂ ਮਿਲੀਆਂ", none: "ਨੇੜੇ ਦੀ ਕੋਈ ਯੋਜਨਾ ਨਹੀਂ ਮਿਲੀ", tryAgain: "ਸੌਖੇ ਸ਼ਬਦਾਂ ਵਿੱਚ ਦੁਬਾਰਾ ਲਿਖੋ ਜਾਂ ਹੋਰ ਸ਼੍ਰੇਣੀ ਚੁਣੋ।", fallback: "ਇਸ ਸੂਚੀ ਵਿੱਚ ਮੇਲ ਖਾਂਦੀ ਯੋਜਨਾ ਨਹੀਂ ਮਿਲੀ। myScheme 'ਤੇ ਹੋਰ ਕੇਂਦਰੀ ਅਤੇ ਰਾਜ ਯੋਜਨਾਵਾਂ ਲੱਭੋ।", official: "ਸਰਕਾਰੀ ਸਰੋਤ", why: "ਕਿਉਂ ਦਿਖਾਇਆ?", goal: "ਤੁਹਾਡਾ ਟੀਚਾ", business: "ਤੁਹਾਡਾ ਕਾਰੋਬਾਰ", description: "ਤੁਹਾਡਾ ਵੇਰਵਾ", answer: "ਤੁਹਾਡਾ ਜਵਾਬ", search: "ਯੋਜਨਾ ਖੋਜ", link: "ਸਰਕਾਰੀ ਵੈੱਬਸਾਈਟ ਵੇਖੋ ↗", disclaimer: "ਇਹ ਮੁੱਢਲੀ ਜਾਣਕਾਰੀ ਹੈ, ਮਨਜ਼ੂਰੀ ਨਹੀਂ। ਮੌਜੂਦਾ ਨਿਯਮ ਸਰਕਾਰੀ ਵੈੱਬਸਾਈਟ 'ਤੇ ਜਾਂਚੋ।", directory: "myScheme.gov.in 'ਤੇ ਕੇਂਦਰ ਅਤੇ ਰਾਜ ਦੀਆਂ ਯੋਜਨਾਵਾਂ ਲੱਭੋ ↗", credit: "JanSamarth 'ਤੇ ਕਰਜ਼ੇ ਨਾਲ ਜੁੜੀਆਂ ਯੋਜਨਾਵਾਂ ↗", footer: "ਅੰਤਿਮ ਯੋਗਤਾ ਅਤੇ ਅਰਜ਼ੀ ਸਰਕਾਰੀ ਪੋਰਟਲ 'ਤੇ ਜਾਂਚੋ।" },
        "sa-IN": { found: "{count} योजनाः प्राप्ताः", none: "समीपे कापि योजना न प्राप्ता", tryAgain: "सरलैः शब्दैः पुनः लिखतु अथवा अन्यां श्रेणीं चिनोतु।", fallback: "अस्मिन् सूचौ अनुकूलयोजना नास्ति। myScheme मध्ये अन्याः केन्द्र-राज्ययोजनाः अन्विष्यन्ताम्।", official: "शासकीयः स्रोतः", why: "किमर्थं दर्शितम्?", goal: "भवतः लक्ष्यः", business: "भवतः व्यवसायः", description: "भवतः विवरणम्", answer: "भवतः उत्तरम्", search: "योजनान्वेषणम्", link: "शासकीयजालस्थलं पश्यतु ↗", disclaimer: "इयं प्रारम्भिकसूचना, अनुमोदनं न। वर्तमाननियमान् शासकीयजालस्थले परीक्षताम्।", directory: "myScheme.gov.in मध्ये केन्द्र-राज्ययोजनाः अन्विष्यताम् ↗", credit: "JanSamarth मध्ये ऋणसम्बद्धयोजनाः ↗", footer: "अन्तिमयोग्यताम् आवेदनं च शासकीयपोर्टले परीक्षताम्।" },
        "sat-IN": { found: "{count} ᱥᱚᱨᱠᱟᱨ ᱥᱠᱤᱢ ᱧᱟᱢᱮᱱᱟ", none: "ᱥᱟᱢᱤᱯᱟᱹᱭ ᱥᱠᱤᱢ ᱵᱟᱹᱧᱟᱢ ᱞᱮᱱᱟ", tryAgain: "ᱟᱨᱦᱚᱸ ᱥᱟᱦᱟᱡ ᱵᱟᱹᱛᱟᱹᱲ ᱮᱢ ᱢᱮ ᱟᱨ ᱵᱟᱝ ᱮᱴᱟᱜ ᱛᱷᱚᱠ ᱵᱟᱪᱷᱟᱣ ᱢᱮ᱾", fallback: "ᱱᱚᱶᱟ ᱛᱟᱞᱠᱟᱨᱮ ᱢᱮᱞ ᱥᱠᱤᱢ ᱵᱟᱹᱧᱟᱢ ᱞᱮᱱᱟ᱾ myScheme ᱨᱮ ᱮᱴᱟᱜ ᱠᱮᱱᱫᱨ ᱟᱨ ᱨᱟᱡᱭ ᱥᱠᱤᱢ ᱧᱮᱞ ᱢᱮ᱾", official: "ᱥᱚᱨᱠᱟᱨᱤ ᱥᱨᱚᱛ", why: "ᱪᱮᱫᱟᱜ ᱩᱫᱩᱜ ᱟᱠᱟᱱᱟ?", goal: "ᱟᱢᱟᱜ ᱡᱚᱥ", business: "ᱟᱢᱟᱜ ᱵᱮᱵᱚᱥᱛᱷᱟ", description: "ᱟᱢᱟᱜ ᱵᱤᱵᱨᱚᱱ", answer: "ᱟᱢᱟᱜ ᱛᱚᱨᱡᱚᱢᱟ", search: "ᱥᱠᱤᱢ ᱧᱮᱞ", link: "ᱥᱚᱨᱠᱟᱨᱤ ᱣᱮᱵᱽᱥᱟᱭᱤᱴ ᱧᱮᱞ ᱢᱮ ↗", disclaimer: "ᱱᱚᱶᱟ ᱥᱟᱶᱛᱟ ᱵᱤᱵᱨᱚᱱ, ᱢᱚᱱᱡᱩᱨᱤ ᱵᱟᱝᱟ᱾ ᱱᱤᱛᱚᱜ ᱱᱤᱭᱚᱢ ᱥᱚᱨᱠᱟᱨᱤ ᱣᱮᱵᱽᱥᱟᱭᱤᱴ ᱨᱮ ᱧᱮᱞ ᱢᱮ᱾", directory: "myScheme.gov.in ᱨᱮ ᱠᱮᱱᱫᱨ ᱟᱨ ᱨᱟᱡᱭ ᱥᱠᱤᱢ ᱧᱮᱞ ᱢᱮ ↗", credit: "JanSamarth ᱨᱮ ᱠᱚᱨᱡᱚ ᱥᱟᱶ ᱡᱩᱲᱟᱹᱣ ᱥᱠᱤᱢ ↗", footer: "ᱢᱩᱪᱟᱹᱫ ᱡᱚᱜᱽᱜᱚᱛᱟ ᱟᱨ ᱟᱨᱡᱤ ᱥᱚᱨᱠᱟᱨᱤ ᱯᱚᱨᱴᱟᱞ ᱨᱮ ᱧᱮᱞ ᱢᱮ᱾" },
        "sd-IN": { found: "{count} اسڪيمون مليون", none: "ويجهو ڪا اسڪيم نه ملي", tryAgain: "سادن لفظن ۾ ٻيهر لکو يا ٻي ڪيٽيگري چونڊيو.", fallback: "هن فهرست ۾ ڪا ملندڙ اسڪيم نه ملي. myScheme تي ٻيون مرڪزي ۽ رياستي اسڪيمون ڳوليو.", official: "سرڪاري ذريعو", why: "ڇو ڏيکاريو ويو؟", goal: "توهان جو مقصد", business: "توهان جو ڪاروبار", description: "توهان جو بيان", answer: "توهان جو جواب", search: "اسڪيم ڳولا", link: "سرڪاري ويب سائيٽ ڏسو ↗", disclaimer: "هي شروعاتي ڄاڻ آهي، منظوري نه. موجوده شرطون سرڪاري ويب سائيٽ تي ڏسو.", directory: "myScheme.gov.in تي مرڪزي ۽ رياستي اسڪيمون ڳوليو ↗", credit: "JanSamarth تي قرض سان لاڳاپيل اسڪيمون ↗", footer: "آخري اهليت ۽ درخواست سرڪاري پورٽل تي ڏسو." },
        "ta-IN": { found: "{count} திட்டங்கள் கிடைத்தன", none: "அருகிலுள்ள திட்டம் எதுவும் கிடைக்கவில்லை", tryAgain: "எளிய சொற்களில் மீண்டும் எழுதவும் அல்லது வேறு வகையைத் தேர்ந்தெடுக்கவும்.", fallback: "இந்தப் பட்டியலில் பொருந்தும் திட்டம் இல்லை. myScheme-ல் மற்ற மத்திய மற்றும் மாநிலத் திட்டங்களைத் தேடுங்கள்.", official: "அதிகாரப்பூர்வ மூலம்", why: "ஏன் காட்டப்படுகிறது?", goal: "உங்கள் இலக்கு", business: "உங்கள் வணிகம்", description: "உங்கள் விவரம்", answer: "உங்கள் பதில்", search: "திட்டத் தேடல்", link: "அதிகாரப்பூர்வ இணையதளத்தைப் பார்க்கவும் ↗", disclaimer: "இது தொடக்கத் தகவல் மட்டுமே, ஒப்புதல் அல்ல. தற்போதைய விதிகளை அதிகாரப்பூர்வ இணையதளத்தில் சரிபார்க்கவும்.", directory: "myScheme.gov.in-ல் மத்திய மற்றும் மாநிலத் திட்டங்களைத் தேடுங்கள் ↗", credit: "JanSamarth-ல் கடன் சார்ந்த திட்டங்கள் ↗", footer: "இறுதி தகுதி மற்றும் விண்ணப்பத்தை அதிகாரப்பூர்வ தளத்தில் சரிபார்க்கவும்." },
        "te-IN": { found: "{count} పథకాలు దొరికాయి", none: "దగ్గరలో సరిపోయే పథకం దొరకలేదు", tryAgain: "సులభమైన పదాలతో మళ్లీ రాయండి లేదా వేరే వర్గాన్ని ఎంచుకోండి.", fallback: "ఈ జాబితాలో సరిపోయే పథకం లేదు. myScheme లో ఇతర కేంద్ర, రాష్ట్ర పథకాలను వెతకండి.", official: "అధికారిక మూలం", why: "ఎందుకు చూపించారు?", goal: "మీ లక్ష్యం", business: "మీ వ్యాపారం", description: "మీ వివరణ", answer: "మీ సమాధానం", search: "పథకం వెతకండి", link: "అధికారిక వెబ్‌సైట్ చూడండి ↗", disclaimer: "ఇది ప్రాథమిక సమాచారం మాత్రమే, ఆమోదం కాదు. ప్రస్తుత నియమాలను అధికారిక వెబ్‌సైట్‌లో పరిశీలించండి.", directory: "myScheme.gov.in లో కేంద్ర, రాష్ట్ర పథకాలను వెతకండి ↗", credit: "JanSamarth లో రుణ సంబంధిత పథకాలు ↗", footer: "చివరి అర్హత, దరఖాస్తును అధికారిక పోర్టల్‌లో పరిశీలించండి." },
        "ur-IN": { found: "{count} اسکیمیں ملیں", none: "قریب کی کوئی اسکیم نہیں ملی", tryAgain: "آسان الفاظ میں دوبارہ لکھیں یا دوسری قسم منتخب کریں۔", fallback: "اس فہرست میں کوئی مماثل اسکیم نہیں ملی۔ myScheme پر دوسری مرکزی اور ریاستی اسکیمیں تلاش کریں۔", official: "سرکاری ذریعہ", why: "کیوں دکھایا گیا؟", goal: "آپ کا مقصد", business: "آپ کا کاروبار", description: "آپ کی تفصیل", answer: "آپ کا جواب", search: "اسکیم تلاش", link: "سرکاری ویب سائٹ دیکھیں ↗", disclaimer: "یہ ابتدائی معلومات ہیں، منظوری نہیں۔ موجودہ قواعد سرکاری ویب سائٹ پر دیکھیں۔", directory: "myScheme.gov.in پر مرکزی اور ریاستی اسکیمیں تلاش کریں ↗", credit: "JanSamarth پر قرض سے منسلک اسکیمیں ↗", footer: "حتمی اہلیت اور درخواست سرکاری پورٹل پر دیکھیں۔" },
        "en-IN": { found: "{count} schemes found", none: "No close scheme match found", tryAgain: "Try a simpler description or choose another category.", fallback: "No match in this list. Search other central and state schemes on myScheme.", official: "Official source", why: "Why shown?", goal: "Your goal", business: "Your business", description: "Your description", answer: "Your answer", search: "Scheme search", link: "View official website ↗", disclaimer: "These are starting points, not approvals. Check current rules on official websites.", directory: "Search central and state schemes on myScheme.gov.in ↗", credit: "Credit-linked schemes on JanSamarth ↗", footer: "Check final eligibility and applications on official portals." }
    };

    function updateLanguagePrompt() {
        const locale = voiceLanguage.value;
        const prompt = languagePrompts[locale] || languagePrompts["hi-IN"];
        const copy = resultCopy[locale] || resultCopy["hi-IN"];
        languagePrompt.textContent = prompt;
        document.documentElement.lang = locale;
        localStorage.setItem(preferredLanguageStorageKey, locale);
        const footerLinks = document.querySelectorAll(".finder-footer a");
        footerLinks[0].textContent = copy.directory;
        footerLinks[1].textContent = copy.credit;
        document.querySelector(".finder-footer span").textContent = copy.footer;
        voiceStatus.textContent = prompt;
    }

    voiceLanguage.addEventListener("change", updateLanguagePrompt);

    const followupOptions = {
        start: {
            label: "आपका काम किस स्थिति में है? / What stage are you at?",
            options: [
                ["idea", "अभी विचार है / I have an idea"],
                ["new", "अभी शुरू किया है / Recently started"],
                ["running", "पहले से काम कर रहे हैं / Already running"]
            ]
        },
        funding: {
            label: "पैसा किस काम के लिए चाहिए? / What do you need finance for?",
            options: [
                ["working-capital", "रोज़ के खर्च / Day-to-day expenses"],
                ["equipment", "मशीन या सामान / Machinery or equipment"],
                ["start", "नया काम शुरू करना / Start a business"],
                ["expansion", "काम बढ़ाना / Grow my business"]
            ]
        },
        equipment: {
            label: "आपको किस चीज़ की ज़रूरत है? / What do you need?",
            options: [
                ["equipment", "मशीन या सामान / Machinery or equipment"],
                ["manufacturing", "उत्पादन बेहतर करना / Improve production"],
                ["service", "सेवा का काम बेहतर करना / Improve my service"]
            ]
        },
        artisan: {
            label: "आप कौन-सा काम करते हैं? / What kind of work?",
            options: [
                ["traditional-craft", "कारीगरी या पारंपरिक काम / Traditional craft"],
                ["training", "काम सीखना / Skills or training"],
                ["artisan-business", "कारीगरी का काम बढ़ाना / Grow my craft business"]
            ]
        },
        procurement: {
            label: "आप क्या बेचना चाहते हैं? / What do you want to sell?",
            options: [
                ["product", "सामान / Products or goods"],
                ["service", "सेवा / Services"],
                ["both", "सामान और सेवा / Both"]
            ]
        },
        startup: {
            label: "आपका स्टार्टअप किस स्थिति में है? / What stage is your startup at?",
            options: [
                ["idea", "विचार / Idea"],
                ["prototype", "पहला नमूना / Early product"],
                ["growth", "चल रहा है, बढ़ाना है / Operating and growing"]
            ]
        },
        export: {
            label: "आप क्या विदेश भेजना चाहते हैं? / What do you want to export?",
            options: [
                ["product", "सामान / Goods"],
                ["food", "खाने का सामान / Food products"],
                ["textile", "कपड़ा या कारीगरी / Textiles or crafts"]
            ]
        },
        "delayed-payment": {
            label: "किससे भुगतान रुका है? / Who owes the payment?",
            options: [
                ["government", "सरकारी खरीदार / Government buyer"],
                ["corporate", "कंपनी / Company buyer"],
                ["receivables", "किसी भी खरीदार से / Any buyer"]
            ]
        }
    };

    const schemes = [
        {
            name: "Pradhan Mantri MUDRA Yojana",
            type: "Credit support · Micro-enterprises",
            description: "छोटे कारोबार के कर्ज़ की जानकारी यहां मिलेगी। शर्तें बैंक से पूछें। / Loan information for small businesses; check terms with the lender.",
            url: "https://www.mudra.org.in/",
            tags: ["funding", "working-capital", "equipment", "start", "expansion", "micro", "small", "service", "manufacturing"]
        },
        {
            name: "Credit Guarantee Scheme · CGTMSE",
            type: "Credit guarantee · Micro and small enterprises",
            description: "यह योजना कुछ छोटे कारोबार के बैंक कर्ज़ की गारंटी देती है; कर्ज़ मंजूर होना पक्का नहीं है। / CGTMSE guarantees some eligible business loans; it does not guarantee loan approval.",
            url: "https://www.cgtmse.in/",
            tags: ["funding", "credit-guarantee", "working-capital", "equipment", "expansion", "micro", "small", "service", "manufacturing"]
        },
        {
            name: "Prime Minister’s Employment Generation Programme · PMEGP",
            type: "New enterprise support · Verify current availability",
            description: "नया कारोबार शुरू करने की योजना। आवेदन और नियम अभी खुले हैं या नहीं, वेबसाइट पर जांचें। / New-business support; check current applications and rules on the official portal.",
            url: "https://www.kviconline.gov.in/pmegpeportal/pmegphome/index.jsp",
            tags: ["start", "manufacturing", "service", "micro", "new-business"]
        },
        {
            name: "PM Formalisation of Micro Food Processing Enterprises · PMFME",
            type: "Food processing businesses",
            description: "खाने-पीने का सामान बनाने वाले छोटे कारोबार के लिए मदद। पात्रता और आवेदन की जानकारी जांचें। / Support for eligible small food-processing businesses; check current rules and applications.",
            url: "https://pmfme.mofpi.gov.in/",
            tags: ["food", "food-processing", "manufacturing", "equipment", "start", "expansion", "funding", "micro"],
            requiredProfileTags: ["food", "food-processing"]
        },
        {
            name: "Agriculture Infrastructure Fund · AIF",
            type: "Agriculture and post-harvest infrastructure",
            description: "खेती के भंडारण और फसल के बाद के काम के लिए कुछ परियोजनाओं को मदद। / Support for eligible farm storage and post-harvest projects; check current terms.",
            url: "https://agriinfra.dac.gov.in/",
            tags: ["agriculture", "farming", "food-processing", "manufacturing", "equipment", "expansion", "funding"],
            requiredProfileTags: ["agriculture", "food-processing"]
        },
        {
            name: "PM Street Vendor’s AtmaNirbhar Nidhi · PM SVANidhi",
            type: "Eligible street vendors",
            description: "ठेले या रेहड़ी पर बेचने वाले पात्र लोगों के लिए कर्ज़ की जानकारी। / Loan information for eligible street vendors; check current rules with the portal or local body.",
            url: "https://pmsvanidhi.mohua.gov.in/",
            tags: ["street-vendor", "funding", "working-capital", "service", "sales"],
            requiredProfileTags: ["street-vendor"]
        },
        {
            name: "Udyam Registration · Ministry of MSME",
            type: "MSME registration and business information",
            description: "छोटे कारोबार का सरकारी MSME पंजीकरण। सरकारी वेबसाइट पर पंजीकरण मुफ्त है। / Free MSME registration on the official government portal.",
            url: "https://udyamregistration.gov.in/",
            tags: ["retail", "food", "agriculture", "textile", "artisan", "manufacturing", "service", "micro", "small", "start", "expansion"]
        },
        {
            name: "PM Vishwakarma",
            type: "Traditional artisans and craftspeople",
            description: "सूची में शामिल पारंपरिक कारीगरों के लिए मदद। अपनी कारीगरी और नियम वेबसाइट पर जांचें। / Support for artisans in notified trades; check the trade list and rules.",
            url: "https://pmvishwakarma.gov.in/",
            tags: ["artisan", "textile", "traditional-craft", "training", "skills", "credit", "micro"]
        },
        {
            name: "Startup India · DPIIT recognition and startup support",
            type: "Innovation-led startups",
            description: "स्टार्टअप की सरकारी पहचान और मदद की जानकारी। पहचान मिलने से पैसा मिलना पक्का नहीं है। / Startup recognition and support information; recognition does not guarantee funding.",
            url: "https://www.startupindia.gov.in/",
            tags: ["startup", "innovation", "idea", "prototype", "growth", "new-business"]
        },
        {
            name: "Government e-Marketplace · GeM",
            type: "Public procurement · Seller registration",
            description: "सरकार को सामान या सेवा बेचने के लिए विक्रेता पंजीकरण और निविदाएं देखें। / Register and explore bids to sell goods or services to government buyers.",
            url: "https://gem.gov.in/",
            tags: ["procurement", "product", "service", "sales", "growth"]
        },
        {
            name: "Credit Guarantee Scheme for Startups · CGSS",
            type: "Credit guarantee · DPIIT-recognised startups",
            description: "DPIIT से मान्यता वाले startups के कुछ कर्ज़ पर गारंटी। पैसा सीधे नहीं मिलता और loan मंजूर होना पक्का नहीं। / Credit-guarantee cover for eligible startup loans; this is not a direct grant or loan approval.",
            url: "https://www.startupindia.gov.in/content/sih/en/credit-guarantee-scheme-for-startups.html",
            tags: ["startup", "funding", "credit-guarantee", "working-capital", "growth", "innovation"]
        },
        {
            name: "Raising and Accelerating MSME Performance · RAMP",
            type: "MSME growth, greening and state support",
            description: "छोटे कारोबार के लिए राज्य के हिसाब से कर्ज़, भुगतान और नई तकनीक की मदद हो सकती है। / MSME support through state programmes for finance, delayed payments and technology; check current local offers.",
            url: "https://ramp.msme.gov.in/ramp/",
            tags: ["micro", "small", "manufacturing", "service", "expansion", "green", "delayed-payment", "women", "digital"]
        },
        {
            name: "MSME Innovative Scheme",
            type: "Incubation, design and intellectual property support",
            description: "नए product का विचार, design या patent मदद के लिए। अभी कौन-से आवेदन खुले हैं, वेबसाइट पर देखें। / Support for product ideas, design and intellectual property; check current calls and eligibility.",
            url: "https://innovative.msme.gov.in/",
            tags: ["startup", "innovation", "idea", "prototype", "design", "manufacturing", "micro", "small"]
        },
        {
            name: "PM Kisan SAMPADA Yojana",
            type: "Food-processing infrastructure and value chains",
            description: "खाद्य सामान बनाने, रखने और बाजार तक पहुंचाने वाली पात्र परियोजनाओं के लिए मदद। आवेदन की तारीख जांचें। / Support for eligible food-processing and supply-chain projects; check open application windows.",
            url: "https://mofpi.gov.in/en",
            tags: ["food", "food-processing", "manufacturing", "cold-storage", "equipment", "expansion", "funding"],
            requiredProfileTags: ["food", "food-processing"]
        },
        {
            name: "Pradhan Mantri Krishi Sinchayee Yojana · Per Drop More Crop",
            type: "Micro-irrigation · Drip and sprinkler systems",
            description: "खेती में drip या sprinkler से पानी बचाने की मदद। अपने राज्य के कृषि विभाग में नियम पूछें। / Support for efficient irrigation; check your state agriculture department.",
            url: "https://pmksy.gov.in/",
            tags: ["agriculture", "farming", "irrigation", "equipment", "water", "funding"],
            requiredProfileTags: ["agriculture", "farming"]
        },
        {
            name: "PM-KUSUM",
            type: "Solar energy for agriculture",
            description: "खेत में solar pump या solar power के लिए पात्र मदद। आवेदन और सब्सिडी राज्य के अनुसार बदलते हैं। / Solar pump and power support for eligible farm projects; rules vary by state.",
            url: "https://pmkusum.mnre.gov.in/",
            tags: ["agriculture", "farming", "solar", "energy", "green", "equipment", "funding"],
            requiredProfileTags: ["agriculture", "farming"]
        },
        {
            name: "Pradhan Mantri Matsya Sampada Yojana · PMMSY",
            type: "Fisheries and aquaculture",
            description: "मछली पालन, तालाब, processing और fisheries कारोबार के लिए पात्र मदद। तारीख राज्य के मत्स्य विभाग से पूछें। / Support for eligible fisheries and aquaculture businesses; check state application dates.",
            url: "https://pmmsy.dof.gov.in/",
            tags: ["fisheries", "aquaculture", "food", "food-processing", "equipment", "cold-storage", "start", "expansion", "funding"]
        },
        {
            name: "National Livestock Mission · Entrepreneurship Development",
            type: "Livestock, poultry, sheep, goat and feed enterprises",
            description: "पशुपालन, मुर्गी, बकरी, भेड़ और चारे का कारोबार शुरू करने में पात्र मदद। / Support for eligible livestock, poultry and feed businesses; check current rules.",
            url: "https://nlm.udyamimitra.in/",
            tags: ["livestock", "dairy", "poultry", "farming", "agriculture", "feed", "start", "expansion", "funding", "equipment"]
        },
        {
            name: "Agri-Clinics and Agri-Business Centres · ACABC",
            type: "Agri-enterprises by trained agriculture graduates",
            description: "कृषि पढ़े युवाओं को agri-clinic या खेती की सेवा वाला कारोबार शुरू करने की जानकारी और प्रशिक्षण। / Training and venture support for eligible agriculture graduates.",
            url: "https://www.agriclinics.net/",
            tags: ["agriculture", "farming", "startup", "start", "training", "service", "funding", "advisory"]
        },
        {
            name: "Mission for Integrated Development of Horticulture · MIDH",
            type: "Horticulture, nurseries and post-harvest support",
            description: "फल, सब्जी, nursery और भंडारण के कारोबार में राज्य के नियम से मदद। अपने राज्य के बागवानी विभाग में पूछें। / Horticulture support varies by state and activity; check your State Horticulture Mission.",
            url: "https://midh.gov.in/",
            tags: ["agriculture", "farming", "horticulture", "nursery", "food", "cold-storage", "equipment", "funding"]
        },
        {
            name: "National Handloom Development Programme · NHDP",
            type: "Handloom weavers and handloom enterprises",
            description: "हथकरघा बुनकर और कपड़ा कारोबार के लिए पात्र मदद। वर्तमान योजना राज्य के handloom कार्यालय से पूछें। / Support for eligible handloom weavers and enterprises; check with your state office.",
            url: "https://handlooms.nic.in/",
            tags: ["textile", "handloom", "artisan", "craft", "training", "equipment", "marketing", "funding"]
        },
        {
            name: "MSME Sustainable (ZED) Certification",
            type: "Quality, productivity and sustainable manufacturing",
            description: "छोटे कारखाने में गुणवत्ता और पर्यावरण सुधारने का प्रमाणपत्र। फीस और सहायता सरकारी पोर्टल पर जांचें। / Certification support for quality and sustainable production; check current rules.",
            url: "https://zed.msme.gov.in/",
            tags: ["manufacturing", "quality", "green", "energy", "micro", "small", "expansion", "training"]
        },
        {
            name: "Export Promotion Mission · NIRYAT PROTSAHAN / NIRYAT DISHA",
            type: "Export finance and non-financial support",
            description: "विदेश में सामान बेचने वाले छोटे कारोबार के लिए export loan और बाजार की मदद। मौजूदा नियम जांचें। / Export finance and market support for eligible businesses; check current guidelines.",
            url: "https://www.dgft.gov.in/CP/?opt=export-promotion-mission",
            tags: ["export", "funding", "marketing", "textile", "food", "manufacturing", "micro", "small"]
        },
        {
            name: "RBI-regulated Trade Receivables Discounting System · TReDS",
            type: "Invoice financing for MSMEs",
            description: "कंपनी या सरकार का बिल देर से मिले तो पात्र छोटे कारोबार उसे financer के पास जमा कर जल्दी पैसा पा सकते हैं। / Eligible MSMEs can finance accepted invoices through RBI-regulated TReDS platforms.",
            url: "https://www.rbi.org.in/Scripts/BS_ViewTreds.aspx",
            tags: ["receivables", "working-capital", "funding", "micro", "small", "sales", "delayed-payment"]
        },
        {
            name: "MSME Samadhaan · Delayed Payment Monitoring System",
            type: "Micro and small enterprise delayed payments",
            description: "MSEs can file delayed-payment references against buyers through the MSME Samadhaan portal, subject to applicable MSME and legal requirements.",
            url: "https://samadhaan.msme.gov.in/",
            tags: ["delayed-payment", "receivables", "working-capital", "micro", "small", "funding", "sales"]
        },
        {
            name: "National SC-ST Hub",
            type: "Market access and procurement support for SC/ST MSEs",
            description: "SC/ST कारोबारियों के लिए सरकारी खरीद, बाजार और कारोबार बढ़ाने की जानकारी। पात्रता जांचें। / Market-access and procurement support for eligible SC/ST-owned MSEs.",
            url: "https://scsthub.in/",
            tags: ["sc-st", "procurement", "sales", "marketing", "micro", "small", "training", "funding"],
            requiredProfileTags: ["sc-st"]
        },
        {
            name: "Stand-Up India",
            type: "Bank loans for eligible women and SC/ST entrepreneurs",
            description: "महिला और SC/ST उद्यमियों के नए कारोबार के लिए बैंक कर्ज़ की जानकारी। अभी आवेदन खुले हैं या नहीं, बैंक से जांचें। / Bank-finance information for eligible women and SC/ST entrepreneurs; confirm availability.",
            url: "https://www.standupmitra.in/",
            tags: ["women", "sc-st", "funding", "start", "greenfield", "manufacturing", "service", "trading"],
            requiredProfileTags: ["women", "sc-st"]
        },
        {
            name: "JanSamarth · National Portal for Government-Sponsored Schemes",
            type: "Central credit-linked scheme discovery and applications",
            description: "कई सरकारी कर्ज़ योजनाओं की पात्रता जांचें और आवेदन करें। हर grant या राज्य योजना यहां नहीं होती। / Check eligibility and apply for multiple credit-linked schemes; not every state scheme or grant is listed.",
            url: "https://www.jansamarth.in/",
            tags: ["directory", "funding", "start", "equipment", "agriculture", "business", "explore"]
        },
        {
            name: "myScheme · Government scheme discovery",
            type: "Official cross-government scheme directory",
            description: "राज्य और केंद्र की योजनाएं खोजें। पूरी सूची, पात्रता और राज्य-विशेष योजनाओं के लिए यहां देखें। / Search central and state schemes, eligibility and state-specific programmes.",
            url: "https://www.myscheme.gov.in/",
            tags: ["directory", "explore", "funding", "start", "equipment", "artisan", "procurement", "startup", "growth", "food", "agriculture", "textile", "retail", "manufacturing", "service", "fisheries", "livestock", "women", "sc-st", "export", "green", "delayed-payment"]
        }
    ];

    const malayalamSchemeTranslations = {
        "https://www.mudra.org.in/": ["പ്രധാനമന്ത്രി മുദ്ര യോജന", "സൂക്ഷ്മ സംരംഭങ്ങൾക്കുള്ള വായ്പാ സഹായം", "ചെറുകിട ബിസിനസുകൾക്കുള്ള വായ്പാ വിവരങ്ങൾ ഇവിടെ ലഭിക്കും. നിബന്ധനകൾ വായ്പാദാതാവിനോട് പരിശോധിക്കുക."],
        "https://www.cgtmse.in/": ["ക്രെഡിറ്റ് ഗ്യാരണ്ടി പദ്ധതി · CGTMSE", "സൂക്ഷ്മ, ചെറുകിട സംരംഭങ്ങൾക്കുള്ള വായ്പാ ഗ്യാരണ്ടി", "യോഗ്യമായ ചില ബിസിനസ് വായ്പകൾക്ക് CGTMSE ഗ്യാരണ്ടി നൽകുന്നു; വായ്പ അനുവദിക്കുമെന്ന് ഉറപ്പില്ല."],
        "https://www.kviconline.gov.in/pmegpeportal/pmegphome/index.jsp": ["പ്രധാനമന്ത്രി തൊഴിൽ സൃഷ്ടി പദ്ധതി · PMEGP", "പുതിയ സംരംഭങ്ങൾക്കുള്ള സഹായം", "പുതിയ ബിസിനസ് ആരംഭിക്കുന്നതിനുള്ള സഹായം. അപേക്ഷകളും നിലവിലെ നിബന്ധനകളും ഔദ്യോഗിക വെബ്സൈറ്റിൽ പരിശോധിക്കുക."],
        "https://pmfme.mofpi.gov.in/": ["സൂക്ഷ്മ ഭക്ഷ്യസംസ്കരണ സംരംഭങ്ങളുടെ ഔപചാരികവൽക്കരണം · PMFME", "ഭക്ഷ്യസംസ്കരണ ബിസിനസുകൾ", "ചെറുകിട ഭക്ഷ്യസംസ്കരണ ബിസിനസുകൾക്കുള്ള സഹായം. യോഗ്യതയും നിലവിലെ അപേക്ഷാ വിവരങ്ങളും പരിശോധിക്കുക."],
        "https://agriinfra.dac.gov.in/": ["കാർഷിക അടിസ്ഥാനസൗകര്യ നിധി · AIF", "കൃഷിക്കും വിളവെടുപ്പിനു ശേഷമുള്ള അടിസ്ഥാനസൗകര്യങ്ങൾക്കും", "കാർഷിക സംഭരണത്തിനും വിളവെടുപ്പിനു ശേഷമുള്ള പ്രവർത്തനങ്ങൾക്കുമുള്ള യോഗ്യ പദ്ധതികൾക്ക് സഹായം ലഭിക്കാം. നിലവിലെ നിബന്ധനകൾ പരിശോധിക്കുക."],
        "https://pmsvanidhi.mohua.gov.in/": ["പ്രധാനമന്ത്രി സ്ട്രീറ്റ് വെണ്ടേഴ്സ് ആത്മനിർഭർ നിധി · PM SVANidhi", "യോഗ്യരായ വഴിയോര കച്ചവടക്കാർക്കുള്ള സഹായം", "യോഗ്യരായ വഴിയോര കച്ചവടക്കാർക്കുള്ള വായ്പാ വിവരങ്ങൾ. നിലവിലെ നിബന്ധനകൾ പോർട്ടലിലോ പ്രാദേശിക സ്ഥാപനത്തിലോ പരിശോധിക്കുക."],
        "https://udyamregistration.gov.in/": ["ഉദ്യമ രജിസ്ട്രേഷൻ · MSME മന്ത്രാലയം", "MSME രജിസ്ട്രേഷനും ബിസിനസ് വിവരങ്ങളും", "ചെറുകിട ബിസിനസുകൾക്കുള്ള ഔദ്യോഗിക MSME രജിസ്ട്രേഷൻ. സർക്കാർ പോർട്ടലിൽ രജിസ്ട്രേഷൻ സൗജന്യമാണ്."],
        "https://pmvishwakarma.gov.in/": ["PM വിശ്വകർമ", "പരമ്പരാഗത കരകൗശല തൊഴിലാളികൾക്കുള്ള സഹായം", "അറിയിച്ചിട്ടുള്ള തൊഴിൽവിഭാഗങ്ങളിലെ കരകൗശല തൊഴിലാളികൾക്കുള്ള സഹായം. തൊഴിൽപ്പട്ടികയും നിബന്ധനകളും പരിശോധിക്കുക."],
        "https://www.startupindia.gov.in/": ["സ്റ്റാർട്ടപ്പ് ഇന്ത്യ · DPIIT അംഗീകാരവും സ്റ്റാർട്ടപ്പ് സഹായവും", "പുതുമയുള്ള സ്റ്റാർട്ടപ്പുകൾക്കുള്ള പിന്തുണ", "സ്റ്റാർട്ടപ്പ് അംഗീകാരവും സഹായവും സംബന്ധിച്ച വിവരങ്ങൾ. അംഗീകാരം ലഭിച്ചതുകൊണ്ട് ധനസഹായം ഉറപ്പാകില്ല."],
        "https://gem.gov.in/": ["ഗവൺമെന്റ് ഇ-മാർക്കറ്റ്പ്ലേസ് · GeM", "സർക്കാർ വാങ്ങൽ · വിൽപ്പനക്കാരുടെ രജിസ്ട്രേഷൻ", "സർക്കാർ വാങ്ങുന്നവർക്ക് സാധനങ്ങളോ സേവനങ്ങളോ വിൽക്കാൻ രജിസ്റ്റർ ചെയ്യുകയും ടെൻഡറുകൾ പരിശോധിക്കുകയും ചെയ്യുക."],
        "https://www.startupindia.gov.in/content/sih/en/credit-guarantee-scheme-for-startups.html": ["സ്റ്റാർട്ടപ്പുകൾക്കുള്ള ക്രെഡിറ്റ് ഗ്യാരണ്ടി പദ്ധതി · CGSS", "DPIIT അംഗീകാരമുള്ള സ്റ്റാർട്ടപ്പുകൾക്കുള്ള വായ്പാ ഗ്യാരണ്ടി", "യോഗ്യമായ സ്റ്റാർട്ടപ്പ് വായ്പകൾക്ക് ഗ്യാരണ്ടി പരിരക്ഷ. ഇത് നേരിട്ടുള്ള ഗ്രാന്റോ വായ്പാ അംഗീകാരമോ അല്ല."],
        "https://ramp.msme.gov.in/ramp/": ["MSME പ്രകടന മെച്ചപ്പെടുത്തൽ പദ്ധതി · RAMP", "MSME വളർച്ചയും സംസ്ഥാനതല സഹായവും", "ധനസഹായം, വൈകിയ പേയ്മെന്റുകൾ, സാങ്കേതികവിദ്യ എന്നിവയ്ക്കായി സംസ്ഥാന പരിപാടികളിലൂടെ സഹായം ലഭിക്കാം. പ്രാദേശിക അവസരങ്ങൾ പരിശോധിക്കുക."],
        "https://innovative.msme.gov.in/": ["MSME ഇന്നൊവേറ്റീവ് പദ്ധതി", "ഇൻക്യുബേഷൻ, ഡിസൈൻ, ബൗദ്ധിക സ്വത്തവകാശ സഹായം", "ഉൽപ്പന്ന ആശയങ്ങൾ, ഡിസൈൻ, ബൗദ്ധിക സ്വത്തവകാശം എന്നിവയ്ക്കുള്ള സഹായം. നിലവിലെ അപേക്ഷകളും യോഗ്യതയും പരിശോധിക്കുക."],
        "https://mofpi.gov.in/en": ["പ്രധാനമന്ത്രി കിസാൻ സമ്പദ യോജന", "ഭക്ഷ്യസംസ്കരണ അടിസ്ഥാനസൗകര്യങ്ങളും വിതരണ ശൃംഖലയും", "യോഗ്യമായ ഭക്ഷ്യസംസ്കരണ, വിതരണശൃംഖല പദ്ധതികൾക്ക് സഹായം ലഭിക്കാം. അപേക്ഷാ കാലയളവ് പരിശോധിക്കുക."],
        "https://pmksy.gov.in/": ["പ്രധാനമന്ത്രി കൃഷി സിഞ്ചായി യോജന · ഓരോ തുള്ളിക്കും കൂടുതൽ വിളവ്", "സൂക്ഷ്മ ജലസേചനം · ഡ്രിപ്പ്, സ്പ്രിങ്ക്ലർ സംവിധാനങ്ങൾ", "കാര്യക്ഷമമായ ജലസേചനത്തിനുള്ള സഹായം. നിങ്ങളുടെ സംസ്ഥാന കൃഷിവകുപ്പിൽ നിബന്ധനകൾ പരിശോധിക്കുക."],
        "https://pmkusum.mnre.gov.in/": ["PM-KUSUM", "കൃഷിക്കുള്ള സൗരോർജ്ജം", "യോഗ്യമായ കാർഷിക പദ്ധതികൾക്കുള്ള സോളാർ പമ്പ്, സൗരോർജ്ജ സഹായം. നിബന്ധനകൾ സംസ്ഥാനത്തിനനുസരിച്ച് മാറും."],
        "https://pmmsy.dof.gov.in/": ["പ്രധാനമന്ത്രി മത്സ്യ സമ്പദ യോജന · PMMSY", "മത്സ്യബന്ധനവും മത്സ്യകൃഷിയും", "മത്സ്യകൃഷി, കുളം, സംസ്കരണം, മത്സ്യബന്ധന ബിസിനസുകൾക്കുള്ള സഹായം. സംസ്ഥാന മത്സ്യവകുപ്പിൽ അപേക്ഷാ തീയതി പരിശോധിക്കുക."],
        "https://nlm.udyamimitra.in/": ["ദേശീയ കന്നുകാലി ദൗത്യം · സംരംഭകത്വ വികസനം", "കന്നുകാലി, കോഴി, ആട്, ചെമ്മരിയാട്, തീറ്റ സംരംഭങ്ങൾ", "കന്നുകാലി, കോഴി, തീറ്റ ബിസിനസുകൾ ആരംഭിക്കുന്നതിന് യോഗ്യമായ സഹായം ലഭിക്കാം. നിലവിലെ നിബന്ധനകൾ പരിശോധിക്കുക."],
        "https://www.agriclinics.net/": ["അഗ്രി-ക്ലിനിക്കുകളും അഗ്രി-ബിസിനസ് കേന്ദ്രങ്ങളും · ACABC", "പരിശീലനം നേടിയ കാർഷിക ബിരുദധാരികളുടെ സംരംഭങ്ങൾ", "യോഗ്യരായ കാർഷിക ബിരുദധാരികൾക്ക് കാർഷിക സേവന സംരംഭങ്ങൾ തുടങ്ങാനുള്ള പരിശീലനവും സഹായവും."],
        "https://midh.gov.in/": ["ഉദ്യാനകൃഷി വികസനത്തിനുള്ള സംയോജിത ദൗത്യം · MIDH", "ഉദ്യാനകൃഷി, നഴ്സറികൾ, വിളവെടുപ്പിനു ശേഷമുള്ള സഹായം", "പഴം, പച്ചക്കറി, നഴ്സറി, സംഭരണ ബിസിനസുകൾക്കുള്ള സഹായം സംസ്ഥാനത്തിനും പ്രവർത്തനത്തിനും അനുസരിച്ച് മാറും."],
        "https://handlooms.nic.in/": ["ദേശീയ കൈത്തറി വികസന പദ്ധതി · NHDP", "കൈത്തറി നെയ്ത്തുകാരും സംരംഭങ്ങളും", "യോഗ്യരായ കൈത്തറി നെയ്ത്തുകാർക്കും സംരംഭങ്ങൾക്കുമുള്ള സഹായം. നിങ്ങളുടെ സംസ്ഥാനത്തെ കൈത്തറി ഓഫീസിൽ പരിശോധിക്കുക."],
        "https://zed.msme.gov.in/": ["MSME സുസ്ഥിര (ZED) സർട്ടിഫിക്കേഷൻ", "ഗുണനിലവാരം, ഉൽപ്പാദനക്ഷമത, സുസ്ഥിര നിർമ്മാണം", "ഗുണനിലവാരവും സുസ്ഥിര ഉൽപ്പാദനവും മെച്ചപ്പെടുത്താനുള്ള സർട്ടിഫിക്കേഷൻ സഹായം. ഫീസും നിബന്ധനകളും പരിശോധിക്കുക."],
        "https://www.dgft.gov.in/CP/?opt=export-promotion-mission": ["കയറ്റുമതി പ്രോത്സാഹന ദൗത്യം · NIRYAT PROTSAHAN / NIRYAT DISHA", "കയറ്റുമതി ധനസഹായവും മറ്റ് പിന്തുണയും", "വിദേശത്തേക്ക് ഉൽപ്പന്നങ്ങൾ വിൽക്കുന്ന യോഗ്യരായ ബിസിനസുകൾക്ക് കയറ്റുമതി ധനസഹായവും വിപണി സഹായവും ലഭിക്കാം."],
        "https://www.rbi.org.in/Scripts/BS_ViewTreds.aspx": ["വ്യാപാര ലഭ്യതാ കിഴിവ് സംവിധാനം · TReDS", "MSME-കൾക്കുള്ള ഇൻവോയ്സ് ധനസഹായം", "അംഗീകരിച്ച ഇൻവോയ്സുകൾ RBI നിയന്ത്രിക്കുന്ന TReDS പ്ലാറ്റ്ഫോമുകളിലൂടെ യോഗ്യമായ MSME-കൾക്ക് ധനസഹായമാക്കാം."],
        "https://samadhaan.msme.gov.in/": ["MSME സമാധാൻ · വൈകിയ പേയ്മെന്റ് നിരീക്ഷണ സംവിധാനം", "സൂക്ഷ്മ, ചെറുകിട സ്ഥാപനങ്ങളുടെ വൈകിയ പേയ്മെന്റുകൾ", "ബാധകമായ MSME, നിയമ നിബന്ധനകൾക്ക് വിധേയമായി വാങ്ങുന്നവർക്കെതിരെ പേയ്മെന്റ് വൈകിയതിന്റെ പരാതി സമർപ്പിക്കാം."],
        "https://scsthub.in/": ["ദേശീയ SC-ST ഹബ്", "SC/ST ഉടമസ്ഥതയിലുള്ള MSE-കൾക്കുള്ള വിപണിയും വാങ്ങൽ സഹായവും", "യോഗ്യരായ SC/ST ഉടമസ്ഥതയിലുള്ള ചെറുകിട സ്ഥാപനങ്ങൾക്ക് സർക്കാർ വാങ്ങൽ, വിപണി പ്രവേശനം, ബിസിനസ് വളർച്ച എന്നിവയ്ക്കുള്ള സഹായം."],
        "https://www.standupmitra.in/": ["സ്റ്റാൻഡ്-അപ്പ് ഇന്ത്യ", "യോഗ്യരായ വനിതകൾക്കും SC/ST സംരംഭകർക്കുമുള്ള ബാങ്ക് വായ്പകൾ", "വനിതകൾക്കും SC/ST സംരംഭകർക്കും പുതിയ ബിസിനസുകൾക്കുള്ള ബാങ്ക് ധനസഹായ വിവരങ്ങൾ. ലഭ്യത ബാങ്കിൽ പരിശോധിക്കുക."],
        "https://www.jansamarth.in/": ["ജൻസമർഥ് · സർക്കാർ പദ്ധതികൾക്കായുള്ള ദേശീയ പോർട്ടൽ", "കേന്ദ്ര വായ്പാ പദ്ധതികൾ കണ്ടെത്തലും അപേക്ഷകളും", "വിവിധ സർക്കാർ വായ്പാ പദ്ധതികൾക്ക് യോഗ്യത പരിശോധിച്ച് അപേക്ഷിക്കുക. എല്ലാ ഗ്രാന്റുകളും സംസ്ഥാന പദ്ധതികളും ഇവിടെ ഉണ്ടാകണമെന്നില്ല."],
        "https://www.myscheme.gov.in/": ["എന്റെ പദ്ധതി · സർക്കാർ പദ്ധതികൾ കണ്ടെത്തുക", "സർക്കാരിന്റെ ഔദ്യോഗിക പദ്ധതി ഡയറക്ടറി", "കേന്ദ്ര, സംസ്ഥാന പദ്ധതികൾ, യോഗ്യത, സംസ്ഥാനതല ആനുകൂല്യങ്ങൾ എന്നിവ ഇവിടെ തിരയുക."]
    };

    const tagAliases = {
        funding: ["loan", "loans", "finance", "funding", "credit", "capital", "ऋण", "कर्ज", "लोन", "वित्त", "पैसा", "पूंजी", "પૈસા", "લોન", "ધિરાણ", "ঋণ", "টকা", "ଋଣ", "ଧନ", "ಹಣ", "ಸಾಲ", "கடன்", "பணம்", "రుణం", "డబ్బు", "വായ്പ", "കടം", "قرض", "پیسے", "ਪੈਸਾ", "ਕਰਜ਼ਾ", "कर्जा", "loan chahiye", "paisa chahiye"],
        equipment: ["equipment", "machine", "machinery", "tools", "मशीन", "उपकरण", "औजार", "યંત્ર", "যন্ত্ৰ", "যন্ত্র", "ଯନ୍ତ୍ର", "ಯಂತ್ರ", "உபகரணம்", "இயந்திரம்", "యంత్రం", "పరికరం", "യന്ത്രം", "مشین", "اوزار", "મશીન", "মেশিন", "machine kharid", "machine kharidna"],
        start: ["start", "starting", "new business", "new enterprise", "शुरू", "नया कारोबार", "नया व्यवसाय", "નવો ધંધો", "নতুন ব্যবসা", "ಹೊಸ ವ್ಯಾಪಾರ", "புதிய தொழில்", "కొత్త వ్యాపారం", "نیا کاروبار", "ਨਵਾਂ ਕਾਰੋਬਾਰ", "व्यवसाय सुरू", "business shuru", "naya business", "naya vyapar"],
        expansion: ["expand", "expansion", "grow", "growth", "विस्तार", "बढ़ाना", "વ્યાપાર વધાર", "ধন্দা বঢ়াব", "வணிகத்தை வளர்க்க", "వ్యాపారం పెంచ", "کاروبار بڑھانا", "ਕਾਰੋਬਾਰ ਵਧਾਉਣਾ", "व्यवसाय वाढव", "business badhana", "vyapar badhana"],
        artisan: ["artisan", "craft", "handicraft", "कारीगर", "कारीगरी", "हस्तशिल्प", "શિલ્પી", "কাৰিকৰ", "कारीगर", "ಕುಶಲಕರ್ಮಿ", "கைவினை", "చేతివృత్తి", "دستکار", "ਕਾਰੀਗਰ", "karigar", "hath ka kaam"],
        training: ["training", "skills", "skill", "प्रशिक्षण", "कौशल", "સિખામણ", "প্ৰশিক্ষণ", "প্রশিক্ষণ", "ತರಬೇತಿ", "பயிற்சி", "శిక్షణ", "تربیت", "ਸਿਖਲਾਈ", "सीखना", "sikhna", "hunar"],
        procurement: ["government", "government buyer", "procurement", "tender", "sell to government", "सरकार को बेचना", "સરકારને વેચ", "চৰকাৰক বিক্ৰী", "সরকারকে বিক্রি", "ಸರ್ಕಾರಕ್ಕೆ ಮಾರಾಟ", "அரசுக்கு விற்க", "ప్రభుత్వానికి అమ్మ", "حکومت کو بیچ", "ਸਰਕਾਰ ਨੂੰ ਵੇਚ", "सरकारला विक", "sarkar", "bechna", "maal", "sarkari tender"],
        startup: ["startup", "start-up", "स्टार्टअप", "ઉદ્યોગસાહસ", "ষ্টাৰ্টআপ", "স্টার্টআপ", "ಸ್ಟಾರ್ಟ್‌ಅಪ್", "தொடக்க நிறுவனம்", "స్టార్టప్", "اسٹارٹ اپ", "ਸਟਾਰਟਅੱਪ", "उद्यमिता", "innovation", "नवाचार", "prototype", "प्रोटोटाइप"],
        "working-capital": ["working capital", "daily expenses", "cash flow", "कार्यशील पूंजी", "રોજિંદો ખર્ચ", "দৈনিক খৰচ", "দৈনিক খরচ", "ದಿನನಿತ್ಯದ ಖರ್ಚು", "அன்றாட செலவு", "రోజువారీ ఖర్చు", "روزمرہ خرچ", "ਰੋਜ਼ਾਨਾ ਖਰਚੇ"],
        manufacturing: ["manufacturing", "factory", "production", "निर्माण", "उत्पादन", "ઉત્પાદન", "উৎপাদন", "ಉತ್ಪಾದನೆ", "உற்பத்தி", "తయారీ", "پیداوار", "ਉਤਪਾਦਨ", "कारखाना"],
        service: ["service", "services", "repair", "सेवा", "સેવા", "সেৱা", "সেবা", "ಸೇವೆ", "சேவை", "సేవ", "خدمات", "ਸੇਵਾ", "सर्विस"],
        micro: ["micro business", "small business", "small enterprise", "छोटा कारोबार", "લઘુ ઉદ્યોગ", "ক্ষুদ্ৰ ব্যৱসায়", "ক্ষুদ্র ব্যবসা", "ಸಣ್ಣ ಉದ್ಯಮ", "சிறு தொழில்", "చిన్న వ్యాపారం", "چھوٹا کاروبار", "ਛੋਟਾ ਕਾਰੋਬਾਰ", "सूक्ष्म उद्यम"],
        food: ["food", "food processing", "खाना", "खाद्य", "খাদ্য", "খাদ্য", "ଖାଦ୍ୟ", "આહાર", "ખોરાક", "ಆಹಾರ", "உணவு", "ఆహారం", "ഭക്ഷണം", "کھانا", "ਭੋਜਨ", "ಅನ್ನ", "खाना बनाना"],
        textile: ["textile", "tailoring", "garment", "कपड़ा", "सिलाई", "વસ્ત્ર", "કપડાં", "বস্ত্ৰ", "কাপড়", "ବସ୍ତ୍ର", "ସିଲେଇ", "ബിസിനസ്സ്", "ബിസിനസ്", "തയ്യൽ", "തുണി", "ಬಟ್ಟೆ", "ಹೊಲಿಗೆ", "துணி", "தையல்", "వస్త్రం", "కుట్టు", "کپڑا", "سلائی", "ਕੱਪੜਾ", "ਸ਼ਿਵਣ", "शिवण", "kapda", "silai", "darzi"],
        agriculture: ["agriculture", "farm", "खेती", "कृषि", "କୃଷି", "ଫସଲ", "ખેતી", "কৃষি", "খেতি", "ಕೃಷಿ", "விவசாயம்", "వ్యవసాయం", "കൃഷി", "زراعت", "ਖੇਤੀ", "शेती", "kheti", "farmer"],
        "food-processing": ["food processing", "खाद्य प्रसंस्करण", "খাদ্য প্ৰক্ৰিয়াকৰণ", "খাদ্য প্রক্রিয়াকরণ", "ખાદ્ય પ્રક્રિયા", "ಆಹಾರ ಸಂಸ್ಕರಣೆ", "உணவு பதப்படுத்துதல்", "ఆహార ప్రాసెసింగ్", "فوڈ پروسیسنگ", "अन्न प्रक्रिया"],
        farming: ["farming", "farmer", "किसानी", "खेती-बाड़ी", "ખેડૂત", "কৃষক", "ରଇତ", "ଚାଷ", "రైతు", "ರೈತ", "விவசாயி", "കർഷകൻ", "കർഷക", "کسان", "ਕਿਸਾਨ", "शेतकरी", "kisan"],
        retail: ["retail", "shop", "store", "दुकान", "କିରାଣା", "ଦୋକାନ", "കട", "കട", "કિરાણા", "દુકાન", "দোকান", "দোকান", "ಅಂಗಡಿ", "கடை", "దుకాణం", "دکان", "ਦੁਕਾਨ", "kirana"],
        "street-vendor": ["street vendor", "vendor", "thela", "ठेला", "रेहड़ी", "ફેરીયો", "લારી", "ঠেলা", "ঠেলাগাড়ি", "ಬೀದಿ ವ್ಯಾಪಾರಿ", "தெரு வியாபாரி", "వీధి వ్యాపారి", "ریڑھی", "ਰੇਹੜੀ", "फेरीवाला", "rehri"],
        fisheries: ["fish", "fisheries", "fishing", "aquaculture", "मत्स्य", "मछली", "মাছ", "মৎস্য", "ମାଛ", "ମତ୍ସ୍ୟ", "માછલી", "મത്സ્ય", "ಮೀನು", "ಮತ್ಸ್ಯ", "மீன்", "மீன்வளம்", "చేప", "మత్స్య", "മത്സ്യം", "മീൻ", "مچھلی", "مچھلی", "ਮੱਛੀ", "ماہی گیری"],
        livestock: ["livestock", "animal husbandry", "पशुपालन", "पशु", "પશુપાલન", "পশুপালন", "ପଶୁପାଳନ", "പശുപാലനം", "ಪಶುಸಂಗೋಪನೆ", "கால்நடை", "పశుపోషణ", "مویشی", "ਪਸ਼ੂ ਪਾਲਣ", "पशुपालन"],
        poultry: ["poultry", "मुर्गी", "मुर्गीपालन", "કૂકડાં", "মুৰ্গী", "କୁକୁଡ଼ା", "കോഴി", "ಕೋಳಿ", "கோழி", "కోళ్లు", "مرغی", "ਮੁਰਗੀ"],
        dairy: ["dairy", "milk business", "दुग्ध", "डेयरी", "દૂધ", "ડેરી", "গাখীৰ", "দুগ্ধ", "ଦୁଗ୍ଧ", "ഡയറി", "പാൽ", "ಹಾಲು", "பால்", "పాల", "دودھ", "ਡੇਅਰੀ", "दूध"],
        horticulture: ["horticulture", "fruit", "vegetable", "बागवानी", "फल", "सब्जी", "બાગાયત", "ફળ", "શાકભાજી", "উদ্যান", "ফল", "শাক-পাচলি", "ଉଦ୍ୟାନ", "ଫଳ", "ପନିପରିବା", "തോട്ടം", "പഴം", "പച്ചക്കറി", "ತೋಟಗಾರಿಕೆ", "பழம்", "காய்கறி", "తోట", "باغبانی", "پھل", "ਸਬਜ਼ੀ", "फळ", "भाजी"],
        export: ["export", "exporting", "വിദേശത്ത് വിൽക്കുക", "ஏற்றுமதி", "ఎగుమతి", "درآمد", "برآمد", "निर्यात", "ਬਰਾਮਦ", "निर्यात", "નિર્યાત", "রপ্তানি", "ରପ୍ତାନି", "ರಫ್ತು"],
        women: ["women entrepreneur", "woman entrepreneur", "women-owned", "महिला उद्यमी", "महिला कारोबार", "महिला उद्यम", "महिला व्यवसाय", "સ્ત્રી ઉદ્યોગસાહસિક", "মহিলা উদ্যোগী", "ମହିଳା ଉଦ୍ୟୋଗୀ", "വനിതാ സംരംഭക", "ಮಹಿಳಾ ಉದ್ಯಮಿ", "பெண் தொழில்முனைவோர்", "మహిళా వ్యాపారవేత్త", "خواتین کاروبار", "ਮਹਿਲਾ ਉਦਯੋਗਪਤੀ"],
        "sc-st": ["sc st entrepreneur", "scheduled caste", "scheduled tribe", "अनुसूचित जाति", "अनुसूचित जनजाति", "અનુસૂચિત જાતિ", "અનુસૂચિત જનજાતિ", "অনুসূচিত জাতি", "ଅନୁସୂଚିତ ଜାତି", "ଅନୁସୂଚିତ ଜନଜାତି", "ಅನುಸೂಚಿತ ಜಾತಿ", "பட்டியல் சாதி", "పట్టిక కులం", "پسماندہ ذات", "ਦਲਿਤ", "ਆਦਿਵਾਸੀ"],
        "delayed-payment": ["delayed payment", "late payment", "unpaid invoice", "payment stuck", "बकाया भुगतान", "भुगतान रुका", "देर से भुगतान", "பணம் வரவில்லை", "చెల్లింపు ఆలస్యం", "ಪಾವತಿ ಬಾಕಿ", "ચૂકવણી બાકી", "বাকী পেমেন্ট", "ବକେୟା ଟଙ୍କା", "urged payment", "invoice pending"],
        receivables: ["invoice", "receivable", "bill pending", "payment due", "इनवॉइस", "बिल बकाया", "बकाया बिल", "पेमेंट अटका"],
        solar: ["solar", "सौर", "સૌર", "সূৰ্য", "ସୌର", "സൗര", "ಸೌರ", "சூரிய", "సౌర", "شمسی", "ਸੂਰਜੀ"],
        energy: ["energy", "electricity", "power bill", "बिजली", "विद्युत", "વીજળી", "বিদ্যুৎ", "ବିଦ୍ୟୁତ", "വൈദ്യുതി", "ವಿದ್ಯುತ್", "மின்சாரம்", "విద్యుత్", "بجلی", "ਬਿਜਲੀ"],
        green: ["green business", "clean technology", "sustainable", "environment", "हरित", "पर्यावरण", "ગ્રીન", "সবুজ", "ପରିବେଶ", "പരിസ്ഥിതി", "ಪರಿಸರ", "சுற்றுச்சூழல்", "పర్యావరణం"],
        handloom: ["handloom", "हथकरघा", "હાથવણાટ", "হস্ততাঁত", "ହସ୍ତତନ୍ତ", "കൈത്തറി", "ಕೈಮಗ್ಗ", "கைத்தறி", "చేనేత", "دستکاری", "ਹੱਥਖੱਡੀ"],
        "cold-storage": ["cold storage", "cold chain", "warehouse", "गोदाम", "शीतगृह", "cold store", "ઠંડા સંગ્રહ", "শীতল ভঁৰাল", "ଶୀତଳ ଭଣ୍ଡାର", "ശീതസംഭരണം", "குளிர்பதன", "శీతల గిడ్డంగి"],
        "food-processing": ["food processing", "खाद्य प्रसंस्करण", "ଖାଦ୍ୟ ପ୍ରକ୍ରିୟାକରଣ", "ഭക്ഷ്യ സംസ്കരണം", "খাদ্য প্রক্রিয়াকরণ", "உணவு பதப்படுத்துதல்"],
        design: ["design", "product design", "डिजाइन", "ડિઝાઇન", "ডিজাইন", "ଡିଜାଇନ", "രൂപകൽപ്പന", "ವಿನ್ಯಾಸ", "வடிவமைப்பு", "రూపకల్పన"],
        marketing: ["marketing", "advertising", "exhibition", "प्रचार", "विपणन", "બજાર", "বিপণন", "ବଜାର", "വിപണനം", "ಮಾರುಕಟ್ಟೆ", "சந்தைப்படுத்தல்", "మార్కెటింగ్"],
        irrigation: ["irrigation", "drip", "sprinkler", "सिंचाई", "ડ્રિપ", "পানী", "ଜଳସେଚନ", "ജലസേചനം", "ನೀರಾವರಿ", "நீர்ப்பாசனம்", "నీటిపారుదల"],
        innovation: ["innovation", "innovative", "नवाचार", "નવાચાર", "উদ্ভাৱন", "ଉଦ୍ଭାବନ", "നവീകരണം", "ಆವಿಷ್ಕಾರ", "புதுமை", "ఆవిష్కరణ"],
    };

    function updateGoalFollowup() {
        const config = followupOptions[goalSelect.value];
        followup.hidden = !config;
        detailSelect.replaceChildren();
        detailSelect.required = Boolean(config);
        if (!config) return;

        followupLabel.textContent = config.label;
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "एक चुनें / Choose one";
        detailSelect.append(placeholder);
        for (const [value, label] of config.options) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = label;
            detailSelect.append(option);
        }
    }

    function inferTags(text) {
        const normalizedText = text.normalize("NFKC").toLocaleLowerCase("hi").replace(/[^\p{L}\p{M}\p{N}\s-]/gu, " ");
        const words = normalizedText.split(/\s+/).filter(Boolean);
        const tags = new Set();
        for (const [tag, aliases] of Object.entries(tagAliases)) {
            const found = aliases.some((alias) => {
                const aliasWords = alias.toLocaleLowerCase("hi").split(/\s+/);
                return words.some((_, index) =>
                    aliasWords.every((word, offset) => words[index + offset] === word)
                );
            });
            if (found) {
                tags.add(tag);
            }
        }
        return tags;
    }

    function addTextElement(parent, tagName, className, text) {
        const element = document.createElement(tagName);
        if (className) element.className = className;
        element.textContent = text;
        parent.append(element);
        return element;
    }

    function renderResults(matches, goal, inferredTags, selectedTags, industry) {
        const locale = voiceLanguage.value;
        const copy = resultCopy[locale] || resultCopy["hi-IN"];
        results.lang = locale.slice(0, 2);
        results.replaceChildren();

        const header = document.createElement("div");
        header.className = "results-heading";
        const resultTitle = addTextElement(header, "h2", "", matches.length
            ? copy.found.replace("{count}", String(matches.length))
            : copy.none);
        resultTitle.id = "results-title";
        results.append(header);

        if (matches.length === 0) {
            const fallback = document.createElement("article");
            fallback.className = "no-matches";
            fallback.textContent = `${copy.fallback} ${copy.tryAgain}`;
            results.append(fallback);
        }

        for (const match of matches) {
            const card = document.createElement("article");
            card.className = "scheme-card";

            const top = document.createElement("div");
            top.className = "scheme-card-top";
            const title = document.createElement("div");
            const translation = locale === "ml-IN" ? malayalamSchemeTranslations[match.scheme.url] : null;
            const schemeTitle = translation ? translation[0] : match.scheme.name;
            const titleLink = document.createElement("a");
            titleLink.className = "scheme-title-link";
            titleLink.href = match.scheme.url;
            titleLink.target = "_blank";
            titleLink.rel = "noopener noreferrer";
            titleLink.setAttribute("aria-label", `${schemeTitle} — ${copy.link}`);
            addTextElement(titleLink, "h3", "", schemeTitle);
            title.append(titleLink);
            addTextElement(title, "p", "scheme-type", translation ? translation[1] : match.scheme.type);
            top.append(title);
            addTextElement(top, "span", "official-pill", copy.official);
            card.append(top);

            addTextElement(card, "p", "", translation ? translation[2] : match.scheme.description);
            const reason = document.createElement("div");
            reason.className = "scheme-reason";
            const reasonLabel = document.createElement("strong");
            reasonLabel.textContent = copy.why;
            reason.append(reasonLabel);
            const matchedLabels = [];
            if (match.scheme.tags.includes(goal)) matchedLabels.push(copy.goal);
            if (industry && match.scheme.tags.includes(industry)) matchedLabels.push(copy.business);
            const overlap = [...inferredTags].filter((tag) => match.scheme.tags.includes(tag));
            if (overlap.length) matchedLabels.push(copy.description);
            const detailTags = [...selectedTags].filter((tag) => tag !== goal && tag !== industry && match.scheme.tags.includes(tag) && !inferredTags.has(tag));
            if (detailTags.length) matchedLabels.push(copy.answer);
            reason.append(document.createTextNode(matchedLabels.length
                ? matchedLabels.join(" · ")
                : copy.search));
            card.append(reason);

            const link = document.createElement("a");
            link.href = match.scheme.url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.className = "scheme-visit-link";
            link.textContent = copy.link;
            const domain = new URL(match.scheme.url).hostname.replace(/^www\./, "");
            addTextElement(link, "span", "scheme-link-domain", domain);
            card.append(link);
            const spokenDescription = match.scheme.description.split(" / ");
            const listenButton = addTextElement(card, "button", "listen-scheme-button", "🔊 सुनें / Listen");
            listenButton.type = "button";
            listenButton.setAttribute("aria-pressed", "false");
            listenButton.dataset.audioHindi = `${match.scheme.name}. ${match.scheme.type}. ${spokenDescription[0]}`;
            listenButton.dataset.audioEnglish = `${match.scheme.name}. ${match.scheme.type}. ${spokenDescription[1] || spokenDescription[0]}`;
            results.append(card);
        }

        addTextElement(results, "p", "field-hint", copy.disclaimer);
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;

    if (!SpeechRecognition) {
        voiceButton.disabled = true;
        voiceStatus.textContent = "इस ब्राउज़र में बोलकर लिखने की सुविधा नहीं है। कृपया नीचे लिखें। / Voice input is not available in this browser. Please type instead.";
    } else {
        recognition = new SpeechRecognition();
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.onstart = () => {
            voiceButton.setAttribute("aria-pressed", "true");
            voiceLanguage.disabled = true;
            voiceButton.textContent = "■ सुनना बंद करें / Stop listening";
            voiceStatus.textContent = languagePrompts[voiceLanguage.value] || languagePrompts["hi-IN"];
        };
        recognition.onresult = (event) => {
            const spokenText = event.results[0][0].transcript.trim();
            businessQuery.value = [businessQuery.value.trim(), spokenText].filter(Boolean).join(" ");
            voiceStatus.textContent = "आपकी बात दर्ज हो गई। / Your words have been added. You can edit them.";
        };
        recognition.onerror = (event) => {
            const messages = {
                "not-allowed": "माइक की अनुमति दें और फिर कोशिश करें। / Allow microphone access, then try again.",
                "no-speech": "आवाज़ सुनाई नहीं दी। फिर से बोलें। / No speech heard. Please try again.",
                "language-not-supported": "यह भाषा इस ब्राउज़र में बोलकर लिखने के लिए उपलब्ध नहीं है। दूसरी भाषा चुनें या लिखें। / This browser does not support speech input for this language. Choose another or type."
            };
            voiceStatus.textContent = messages[event.error] || "माइक चालू नहीं हो पाया। कृपया फिर कोशिश करें या लिखें। / Microphone could not start. Try again or type instead.";
        };
        recognition.onend = () => {
            voiceButton.setAttribute("aria-pressed", "false");
            voiceLanguage.disabled = false;
            voiceButton.innerHTML = '<span aria-hidden="true">🎙</span> बोलकर बताएं / Speak';
        };
    }

    voiceButton.addEventListener("click", () => {
        if (!recognition) return;
        if (voiceButton.getAttribute("aria-pressed") === "true") {
            recognition.stop();
            return;
        }
        recognition.lang = voiceLanguage.value;
        try {
            recognition.start();
        } catch (error) {
            if (error.name !== "InvalidStateError") throw error;
            voiceStatus.textContent = "माइक पहले से चालू है। / The microphone is already listening.";
        }
    });

    updateLanguagePrompt();
    goalSelect.addEventListener("change", updateGoalFollowup);
    for (const shortcut of document.querySelectorAll("[data-goal-shortcut]")) {
        shortcut.addEventListener("click", () => {
            goalSelect.value = shortcut.dataset.goalShortcut;
            goalSelect.dispatchEvent(new Event("change"));
            goalSelect.focus();
            goalSelect.scrollIntoView({ behavior: "smooth", block: "center" });
        });
    }
    businessFinderForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!businessFinderForm.reportValidity()) return;

        const formData = new FormData(businessFinderForm);
        const goal = String(formData.get("goal"));
        const query = [formData.get("activity"), formData.get("query")].filter(Boolean).join(" ");
        const scriptLanguages = [
            { pattern: /[\u0D00-\u0D7F]/u, options: ["ml-IN"] },
            { pattern: /[\u0B80-\u0BFF]/u, options: ["ta-IN"] },
            { pattern: /[\u0C00-\u0C7F]/u, options: ["te-IN"] },
            { pattern: /[\u0C80-\u0CFF]/u, options: ["kn-IN"] },
            { pattern: /[\u0A80-\u0AFF]/u, options: ["gu-IN"] },
            { pattern: /[\u0B00-\u0B7F]/u, options: ["or-IN"] },
            { pattern: /[\u0A00-\u0A7F]/u, options: ["pa-IN"] },
            { pattern: /[\uABC0-\uABFF]/u, options: ["mni-IN"] },
            { pattern: /[\u1C50-\u1C7F]/u, options: ["sat-IN"] },
            { pattern: /[\u0980-\u09FF]/u, options: ["as-IN", "bn-IN", "mni-IN"] },
            { pattern: /[\u0900-\u097F]/u, options: ["hi-IN", "brx-IN", "doi-IN", "kok-IN", "mai-IN", "mr-IN", "ne-IN", "sa-IN"] },
            { pattern: /[\u0600-\u06FF]/u, options: ["ks-IN", "sd-IN", "ur-IN"] }
        ];
        const detectedScript = scriptLanguages.find((script) => script.pattern.test(query));
        if (detectedScript) {
            const language = detectedScript.options.includes(voiceLanguage.value)
                ? voiceLanguage.value
                : detectedScript.options[0];
            if (language !== voiceLanguage.value) {
                voiceLanguage.value = language;
                updateLanguagePrompt();
            }
        }
        let inferredTags = inferTags(query);
        const industry = String(formData.get("industry") || "");
        const detail = String(formData.get("detail") || "");
        const language = voiceLanguage.value;

        if (location.protocol !== "file:" && query) {
            submitButton.disabled = true;
            submitButton.textContent = "भाषा समझ रहे हैं... / Finding schemes...";
            try {
                const analysis = await apiRequest("/api/indic-scheme-match", {
                    method: "POST",
                    body: JSON.stringify({ text: query, language })
                });
                inferredTags = new Set([...inferredTags, ...analysis.tags]);
                if (analysis.prompt) languagePrompt.textContent = analysis.prompt;
            } catch (error) {
                console.error("Indic language analysis is unavailable; using local matching.", error);
            } finally {
                submitButton.disabled = false;
                submitButton.innerHTML = 'मेरी योजनाएं दिखाएं / Show my schemes <span aria-hidden="true">→</span>';
            }
        }

        const tags = new Set(inferredTags);
        if (industry && industry !== "other") tags.add(industry);
        tags.add(goal);
        if (detail) tags.add(detail);

        const matches = schemes
            .map((scheme) => ({
                scheme,
                score: (scheme.tags.includes(industry) ? 10 : 0) +
                    (scheme.tags.includes(goal) ? 4 : 0) +
                    [...tags].filter((tag) => tag !== goal && tag !== industry && scheme.tags.includes(tag)).length,
                goalMatch: scheme.tags.includes(goal),
                detailMatch: [...tags].some((tag) => tag !== goal && tag !== industry && !inferredTags.has(tag) && scheme.tags.includes(tag)),
                searchMatches: [...inferredTags].filter((tag) => scheme.tags.includes(tag)).length
            }))
            .filter((match) => match.scheme.tags.includes("directory")
                ? goal === "explore"
                : goal === "explore" || (match.score > 0 && (!match.scheme.requiredProfileTags ||
                    match.scheme.requiredProfileTags.some((tag) => tag === industry || inferredTags.has(tag))))
            )
            .sort((first, second) => second.score - first.score || first.scheme.name.localeCompare(second.scheme.name));

        renderResults(matches, goal, inferredTags, tags, industry);
    });
}
