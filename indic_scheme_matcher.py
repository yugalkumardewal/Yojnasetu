import json
import sys
import unicodedata

try:
    from indicnlp.normalize.indic_normalize import IndicNormalizerFactory
except ImportError as error:
    raise SystemExit("Install Python dependencies with: python -m pip install -r requirements.txt") from error


LANGUAGES = {
    "as": ("অসমীয়া", "আপোনাৰ ব্যৱসায় আৰু কি সহায় লাগে সেই বিষয়ে কওক।"),
    "bn": ("বাংলা", "আপনার ব্যবসা ও কী সাহায্য দরকার, তা বলুন।"),
    "brx": ("बड़ो", "नोंथांनि बेवसाय आरो माबोरै मदद लागो, बेखौ बुं।"),
    "doi": ("डोगरी", "अपने कारोबार ते केह् मदद चाहीदी ऐ, दस्सो।"),
    "en": ("English", "Tell us about your business and what help you need."),
    "gu": ("ગુજરાતી", "તમારા ધંધા અને તમને કઈ મદદ જોઈએ છે તે જણાવો."),
    "hi": ("हिंदी", "अपने कारोबार और आपको किस मदद की ज़रूरत है, बताएं।"),
    "kn": ("ಕನ್ನಡ", "ನಿಮ್ಮ ವ್ಯಾಪಾರ ಮತ್ತು ನಿಮಗೆ ಬೇಕಾದ ಸಹಾಯದ ಬಗ್ಗೆ ತಿಳಿಸಿ."),
    "ks": ("कॉशुर", "پنٛنِس کاروبار تہٕ ضروٗری مددہٕ بارے وٲتھ"),
    "kok": ("कोंकणी", "तुमच्या धंद्या विशीं आनी तुमका खंयची मदत जाय तें सांगात."),
    "mai": ("मैथिली", "अपन कारोबार आ अहाँकेँ कोन मदतिक जरूरत अछि, से बताउ."),
    "ml": ("മലയാളം", "നിങ്ങളുടെ ബിസിനസിനെക്കുറിച്ചും എന്ത് സഹായമാണ് വേണ്ടതെന്നും പറയൂ."),
    "mni": ("মেইতেই", "নহাক্কী বিজিনেস অমসুং করিগুম্বা মতমদা মদুং পাম্বগে হায়বদু হায়বিয়ু।"),
    "mr": ("मराठी", "तुमच्या व्यवसायाबद्दल आणि कोणती मदत हवी आहे ते सांगा."),
    "ne": ("नेपाली", "आफ्नो व्यवसाय र कस्तो सहयोग चाहिन्छ भन्नुहोस्।"),
    "or": ("ଓଡ଼ିଆ", "ଆପଣଙ୍କ ବ୍ୟବସାୟ ଓ କେଉଁ ସହାୟତା ଦରକାର କୁହନ୍ତୁ।"),
    "pa": ("ਪੰਜਾਬੀ", "ਆਪਣੇ ਕਾਰੋਬਾਰ ਅਤੇ ਤੁਹਾਨੂੰ ਕਿਹੜੀ ਮਦਦ ਚਾਹੀਦੀ ਹੈ, ਦੱਸੋ।"),
    "sa": ("संस्कृतम्", "भवतः व्यवसायस्य आवश्यकसाहाय्यस्य च विषये वदतु।"),
    "sat": ("ᱥᱟᱱᱛᱟᱲᱤ", "ᱟᱢᱟᱜ ᱵᱮᱵᱚᱥᱛᱷᱟ ᱟᱨ ᱪᱮᱫ ᱜᱚᱲᱚ ᱞᱟᱹᱠᱛᱤ ᱭᱟᱹ ᱩᱫᱩᱜ ᱢᱮ।"),
    "sd": ("سنڌي", "پنهنجي ڪاروبار ۽ گهربل مدد بابت ٻڌايو."),
    "ta": ("தமிழ்", "உங்கள் வணிகம் மற்றும் உங்களுக்கு என்ன உதவி தேவை என்பதைச் சொல்லுங்கள்."),
    "te": ("తెలుగు", "మీ వ్యాపారం గురించి, మీకు ఎలాంటి సహాయం కావాలో చెప్పండి."),
    "ur": ("اردو", "اپنے کاروبار اور آپ کو کس مدد کی ضرورت ہے، بتائیں۔"),
}

ALIASES = {
    "funding": [
        "loan", "loans", "finance", "funding", "credit", "capital", "ऋण", "कर्ज", "क़र्ज़", "लोन", "वित्त", "પૈસા", "લોન", "ધિરાણ", "ঋণ", "ধন", "ঋণ", "টকা", "ଋଣ", "ಹಣ", "ಸಾಲ", "கடன்", "பணம்", "రుణం", "అప్పు", "రుణ", "డబ్బు", "വായ്പ", "കടം", "قرض", "پیسے", "قرضو", "ਪੈਸੇ", "ਕਰਜ਼ਾ", "ಕರ್ಜ", "पैसे", "पैसा", "कर्जा", "কর্জ", "पैसा चाही", "loan chahiye", "paisa chahiye", "paise chahiye", "business loan"
    ],
    "equipment": [
        "equipment", "machine", "machinery", "tools", "मशीन", "ઉપકરણ", "મશીન", "যন্ত্ৰ", "যন্ত্র", "যন্ত্ৰপাতি", "ଯନ୍ତ୍ର", "ಯಂತ್ರ", "ಉಪಕರಣ", "இயந்திரம்", "கருவி", "యంత్రం", "పరికరం", "യന്ത്രം", "ഉപകരണം", "مشین", "اوزار", "ਮਸ਼ੀਨ", "उपकरण", "यंत्र", "मशिन", "मशीन खरीद", "machine kharid", "machine kharidna"
    ],
    "start": [
        "start business", "starting a business", "new business", "शुरू", "नया कारोबार", "নতুন ব্যৱসায়", "নতুন ব্যবসা", "નવો ધંધો", "ಹೊಸ ವ್ಯಾಪಾರ", "புதிய தொழில்", "కొత్త వ్యాపారం", "نیا کاروبار", "ਨਵਾਂ ਕਾਰੋਬਾਰ", "नवीन व्यवसाय", "नयाँ व्यवसाय", "व्यवसाय सुरु", "business shuru", "naya business", "naya vyapar"
    ],
    "expansion": [
        "expand", "expansion", "grow my business", "വ്യാപാരം വളർത്തുക", "ವ್ಯಾಪಾರ ಬೆಳೆಸ", "வணிகத்தை வளர்க்க", "వ్యాపారం పెంచ", "کاروبار بڑھانا", "ਕਾਰੋਬਾਰ ਵਧਾਉਣਾ", "व्यवसाय वाढव", "व्यवसाय बढाउन", "ধন্দা বঢ়াব", "business badhana", "vyapar badhana"
    ],
    "artisan": [
        "artisan", "craft", "handicraft", "कारीगर", "कारीगरी", "हस्तशिल्प", "শিল্পী", "কাৰিকৰ", "કારીગર", "ಕುಶಲಕರ್ಮಿ", "கைவினை", "చేతివృత్తి", "دستکار", "ਕਾਰੀਗਰ", "कारागीर", "कारीगर", "karigar", "hath ka kaam"
    ],
    "training": [
        "training", "skills", "skill", "प्रशिक्षण", "कौशल", "તાલીમ", "প্ৰশিক্ষণ", "প্রশিক্ষণ", "ತರಬೇತಿ", "பயிற்சி", "శిక్షణ", "تربیت", "ਸਿਖਲਾਈ", "प्रशिक्षण", "सीखना", "sikhna", "hunar"
    ],
    "procurement": [
        "government tender", "government buyer", "procurement", "sell to government", "सरकार को बेचना", "સરકારને વેચ", "চৰকাৰক বিক্ৰী", "সরকারকে বিক্রি", "ಸರ್ಕಾರಕ್ಕೆ ಮಾರಾಟ", "அரசுக்கு விற்க", "ప్రభుత్వానికి అమ్మ", "حکومت کو بیچ", "ਸਰਕਾਰ ਨੂੰ ਵੇਚ", "सरकारला विक", "सरकारलाई बेच", "sarkari tender", "sarkar ko bechna"
    ],
    "startup": [
        "startup", "start-up", "स्टार्टअप", "સ્ટાર્ટઅપ", "ষ্টাৰ্টআপ", "স্টার্টআপ", "ಸ್ಟಾರ್ಟ್‌ಅಪ್", "தொடக்க நிறுவனம்", "స్టార్టప్", "اسٹارٹ اپ", "ਸਟਾਰਟਅੱਪ", "नवउद्यम", "innovation", "prototype", "नवाचार"
    ],
    "working-capital": [
        "working capital", "daily expenses", "cash flow", "रोजमर्रा खर्च", "દૈનિક ખર્ચ", "দৈনিক খৰচ", "দৈনিক খরচ", "ದಿನನಿತ್ಯದ ಖರ್ಚು", "அன்றாட செலவு", "రోజువారీ ఖర్చు", "روزمرہ خرچ", "ਰੋਜ਼ਾਨਾ ਖਰਚੇ", "रोजचा खर्च", "दैनिक खर्च"
    ],
    "manufacturing": [
        "manufacturing", "factory", "production", "निर्माण", "उत्पादन", "ઉત્પાદન", "উৎপাদন", "ଉତ୍ପାଦନ", "ಉತ್ಪಾದನೆ", "உற்பத்தி", "తయారీ", "ഉൽപ്പാദനം", "പുനരുത്പാദനം", "پیداوار", "ਉਤਪਾਦਨ", "उद्योग"
    ],
    "service": [
        "service", "services", "repair", "सेवा", "સેવા", "সেৱা", "সেবা", "ସେବା", "ಸೇವೆ", "சேவை", "సేవ", "സേവനം", "خدمات", "ਸੇਵਾ", "repair shop"
    ],
    "micro": [
        "micro business", "small business", "small enterprise", "छोटा कारोबार", "લઘુ ઉદ્યોગ", "ক্ষুদ্ৰ ব্যৱসায়", "ক্ষুদ্র ব্যবসা", "ସାନ ବ୍ୟବସାୟ", "സൂക്ഷ്മ ബിസിനസ്സ്", "ചെറുകിട ബിസിനസ്", "ಸಣ್ಣ ಉದ್ಯಮ", "சிறு தொழில்", "చిన్న వ్యాపారం", "چھوٹا کاروبار", "ਛੋਟਾ ਕਾਰੋਬਾਰ", "लघुउद्योग", "small business"
    ],
    "food": [
        "food", "food business", "खाना", "खाद्य", "ખોરાક", "ખાદ્ય", "খাদ্য", "খাদ্য", "ଖାଦ୍ୟ", "ആഹാരം", "ഭക്ഷണം", "ಆಹಾರ", "உணவு", "ఆహారం", "کھانا", "ਭੋਜਨ", "अन्न", "खाना बनाना", "food processing"
    ],
    "food-processing": [
        "food processing", "खाद्य प्रसंस्करण", "খাদ্য প্ৰক্ৰিয়াকৰণ", "খাদ্য প্রক্রিয়াকরণ", "ખાદ્ય પ્રક્રિયા", "ଖାଦ୍ୟ ପ୍ରକ୍ରିୟାକରଣ", "ഭക്ഷ്യ സംസ്കരണം", "ആഹാര സംസ്കരണം", "ಆಹಾರ ಸಂಸ್ಕರಣೆ", "உணவு பதப்படுத்துதல்", "ఆహార ప్రాసెసింగ్", "فوڈ پروسیسنگ", "अन्न प्रक्रिया"
    ],
    "textile": [
        "textile", "tailoring", "garment", "कपड़ा", "सिलाई", "વસ્ત્ર", "કપડાં", "বস্ত্ৰ", "কাপড়", "ବସ୍ତ୍ର", "ସିଲେଇ", "തുണി", "തയ്യൽ", "വസ്ത്രം", "బట్టలు", "కుట్టు", "ಬಟ್ಟೆ", "ಹೊಲಿಗೆ", "துணி", "தையல்", "వస్త్రం", "کپڑا", "سلائی", "ਕੱਪੜਾ", "ਸਿਲਾਈ", "शिवण", "kapda", "silai", "darzi"
    ],
    "agriculture": [
        "agriculture", "farm", "farming", "खेती", "कृषि", "કૃષિ", "ખેતી", "কৃষি", "খেতি", "କୃଷି", "ଚାଷ", "കൃഷി", "ಕೃಷಿ", "விவசாயம்", "వ్యవసాయం", "زراعت", "ਖੇਤੀ", "शेती", "kheti", "farmer"
    ],
    "farming": [
        "farming", "farmer", "किसान", "ખેડૂત", "কৃষক", "ରଇତ", "ଚାଷୀ", "കർഷകൻ", "കർഷക", "ರೈತ", "விவசாயி", "రైతు", "کسان", "ਕਿਸਾਨ", "शेतकरी", "kisan"
    ],
    "retail": [
        "retail", "shop", "store", "दुकान", "କିରାଣା", "ଦୋକାନ", "കട", "കട", "કિરાણા", "દુકાન", "দোকান", "দোকান", "ಅಂಗಡಿ", "கடை", "దుకాణం", "دکان", "ਦੁਕਾਨ", "दुकान", "kirana", "shop business"
    ],
    "street-vendor": [
        "street vendor", "vendor", "thela", "ठेला", "रेहड़ी", "ફેરીયો", "લારી", "ঠেলা", "ঠেলাগাড়ি", "ಬೀದಿ ವ್ಯಾಪಾರಿ", "தெரு வியாபாரி", "వీధి వ్యాపారి", "ریڑھی", "ਰੇਹੜੀ", "फेरीवाला", "rehri", "thela"
    ],
}

ALIASES.update({
    "fisheries": ["fish", "fisheries", "fishing", "aquaculture", "ମାଛ", "ମତ୍ସ୍ୟ", "മത്സ്യം", "மீன்", "చేప", "مچھلی", "মাছ"],
    "livestock": ["livestock", "animal husbandry", "पशुपालन", "પશુપાલન", "ପଶୁପାଳନ", "മൃഗസംരക്ഷണം", "ಪಶುಸಂಗೋಪನೆ", "கால்நடை", "పశుపోషణ", "مویشی"],
    "poultry": ["poultry", "मुर्गीपालन", "କୁକୁଡ଼ା", "കോഴി", "ಕೋಳಿ", "கோழி", "కోళ్లు", "مرغی"],
    "dairy": ["dairy", "milk business", "डेयरी", "દૂધ", "দুগ্ধ", "ଦୁଗ୍ଧ", "ഡയറി", "പാൽ", "ಹಾಲು", "பால்", "పాల", "دودھ"],
    "horticulture": ["horticulture", "fruit", "vegetable", "बागवानी", "બાગાયત", "ଉଦ୍ୟାନ", "തോട്ടം", "ತೋಟಗಾರಿಕೆ", "காய்கறி", "తోట", "باغبانی"],
    "export": ["export", "exporting", "निर्यात", "ਬਰਾਮਦ", "નિર્યાત", "রপ্তানি", "ରପ୍ତାନି", "ರಫ್ತು", "ஏற்றுமதி", "ఎగుమతి", "صادرات"],
    "women": ["women entrepreneur", "woman entrepreneur", "women-owned", "महिला उद्यमी", "ગુજરાતી મહિલા ઉદ્યોગસાહસિક", "মহিলা উদ্যোগী", "ମହିଳା ଉଦ୍ୟୋଗୀ", "വനിതാ സംരംഭക", "ಮಹಿಳಾ ಉದ್ಯಮಿ", "பெண் தொழில்முனைவோர்", "మహిళా వ్యాపారవేత్త", "خواتین کاروبار", "ਮਹਿਲਾ ਉਦਯੋਗਪਤੀ"],
    "sc-st": ["sc st entrepreneur", "scheduled caste", "scheduled tribe", "अनुसूचित जाति", "अनुसूचित जनजाति", "અનુસૂચિત જાતિ", "অনুসূচিত জাতি", "ଅନୁସୂଚିତ ଜାତି", "ಅನುಸೂಚಿತ ಜಾತಿ", "பட்டியல் சாதி", "పట్టిక కులం", "دلت", "ਦਲਿਤ", "ਆਦਿਵਾਸੀ"],
    "delayed-payment": ["delayed payment", "late payment", "unpaid invoice", "payment stuck", "बकाया भुगतान", "भुगतान रुका", "பணம் வரவில்லை", "చెల్లింపు ఆలస్యం", "ಪಾವತಿ ಬಾಕಿ", "ચૂકવણી બાકી", "ବକେୟା ଟଙ୍କା"],
    "receivables": ["invoice", "receivable", "bill pending", "payment due", "इनवॉइस", "बिल बकाया", "पेमेंट अटका"],
    "solar": ["solar", "सौर", "સૌર", "ଉର୍ଜା", "സൗര", "ಸೌರ", "சூரிய", "సౌర", "شمسی", "ਸੂਰਜੀ"],
    "energy": ["energy", "electricity", "power bill", "बिजली", "વિદ્યુત", "বিদ্যুৎ", "ବିଦ୍ୟୁତ", "വൈദ്യുതി", "ವಿದ್ಯುತ್", "மின்சாரம்", "విద్యుత్", "بجلی"],
    "green": ["green business", "clean technology", "sustainable", "environment", "हरित", "पर्यावरण", "সবুজ", "ପରିବେଶ", "പരിസ്ഥിതി", "ಪರಿಸರ", "சுற்றுச்சூழல்", "పర్యావరణం"],
    "handloom": ["handloom", "हथकरघा", "હાથવણાટ", "হস্ততাঁত", "ହସ୍ତତନ୍ତ", "കൈത്തറി", "ಕೈಮಗ್ಗ", "கைத்தறி", "చేనేత", "دستکاری", "ਹੱਥਖੱਡੀ"],
    "cold-storage": ["cold storage", "cold chain", "warehouse", "गोदाम", "શીતગૃહ", "শীতল ভঁৰাল", "ଶୀତଳ ଭଣ୍ଡାର", "ശീതസംഭരണം", "குளிர்பதன", "శీతల గిడ్డంగి"],
    "design": ["design", "product design", "डिजाइन", "ડિઝાઇન", "ডিজাইন", "ଡିଜାଇନ", "രൂപകൽപ്പന", "ವಿನ್ಯಾಸ", "வடிவமைப்பு", "రూపకల్పన"],
    "marketing": ["marketing", "advertising", "exhibition", "प्रचार", "विपणन", "બજાર", "বিপণন", "ବଜାର", "വിപണനം", "ಮಾರುಕಟ್ಟೆ", "சந்தைப்படுத்தல்", "మార్కెటింగ్"],
    "irrigation": ["irrigation", "drip", "sprinkler", "सिंचाई", "ડ્રિપ", "জলসেচন", "ଜଳସେଚନ", "ജലസേചനം", "ನೀರಾವರಿ", "நீர்ப்பாசனம்", "నీటిపారుదల"],
})

ALIASES["traditional-craft"] = ALIASES["artisan"]
ALIASES["new-business"] = ALIASES["start"]
ALIASES["shop"] = ALIASES["retail"]
ALIASES["credit-guarantee"] = ALIASES["funding"]
ALIASES["skills"] = ALIASES["training"]
ALIASES["sales"] = ALIASES["procurement"]
ALIASES["small"] = ALIASES["micro"]

NORMALIZER_LANGUAGES = {
    "as", "bn", "gu", "hi", "kn", "ml", "mr", "or", "pa", "ta", "te"
}


def normalize_text(text, normalizer=None):
    text = unicodedata.normalize("NFKC", text).casefold()
    if normalizer:
        text = normalizer.normalize(text)
    return "".join(
        character if character.isspace() or character == "-" or
        unicodedata.category(character)[0] in {"L", "M", "N"} else " "
        for character in text
    )


def main():
    request = json.load(sys.stdin)
    text = request.get("text", "")
    language = request.get("language", "hi-IN")
    if not isinstance(text, str) or len(text) > 2000:
        raise ValueError("Text must be a string of at most 2000 characters.")
    if not isinstance(language, str) or language.split("-", 1)[0].lower() not in LANGUAGES:
        raise ValueError("Choose one of the supported Indian languages.")

    lang_code = language.split("-", 1)[0].lower()
    normalizer = None
    if lang_code in NORMALIZER_LANGUAGES:
        normalizer = IndicNormalizerFactory().get_normalizer(lang_code)
    normalized = normalize_text(text, normalizer)
    tags = []
    for tag, phrases in ALIASES.items():
        for phrase in phrases:
            if normalize_text(phrase, normalizer) in normalized:
                tags.append(tag)
                break

    language_name, friendly_prompt = LANGUAGES[lang_code]
    print(json.dumps({
        "tags": sorted(set(tags)),
        "language": lang_code,
        "languageName": language_name,
        "prompt": friendly_prompt,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
