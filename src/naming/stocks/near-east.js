// Name stocks: Persian, Arabic, Turkish, Hebrew, Ancient Egyptian and
// Akkadian. See src/naming/stocks/index.js for the shape.

export default [
    {
        id: 'persian', label: 'Persian', detect: ['persia', 'persian', 'iran', 'iranian', 'tehran', 'isfahan', 'shiraz', 'achaemenid', 'sasanian'],
        era: 'modern', convention: 'western', adjective: ['i', 'ian'],
        given: {
            m: 'Mohammad Ali Hossein Reza Mehdi Amir Hassan Mohsen Saeed Majid Hamid Javad Ahmad Abbas Farhad Dariush Kourosh Cyrus Rostam Sohrab Bahram Ardeshir Shahram Babak Kaveh Arash Behrouz Bijan Esfandiar Fereydoun Jamshid Kamran Kian Manouchehr Navid Omid Parviz Payam Ramin Shahin Siavash Soroush Vahid Yazdan Arman Afshin Houshang Keyvan Mazdak Nima Pouya Sepehr Shahab',
            f: 'Fatemeh Zahra Maryam Leila Sara Narges Zeynab Mahsa Shirin Parisa Nasrin Azadeh Farideh Golnar Roya Shabnam Mina Nazanin Parvaneh Simin Soraya Taraneh Yasmin Ziba Anahita Ashraf Banafsheh Darya Elnaz Faranak Golshifteh Homa Katayoun Laleh Mahnaz Mitra Negar Pegah Pari Rana Sepideh Setareh Shahrzad Tahmineh Roxana Atoosa Bahar Delaram Niloufar Sahar',
        },
        family: 'Mohammadi Hosseini Ahmadi Rezaei Moradi Karimi Jafari Rahimi Hashemi Mousavi Sadeghi Ghasemi Heydari Kazemi Ebrahimi Akbari Sharifi Rostami Salehi Hosseinzadeh Najafi Zamani Ghorbani Bagheri Amini Alavi Tehrani Shirazi Esfahani Tabrizi Yazdi Kermani Khorasani Rashidi Farahani Ghaffari Mahmoudi Nouri Nikpour Mirzaei Shahbazi Golestani Jahangiri Bahrami Farzaneh Ansari Kiani Abedi Parsa Pahlavi Fardoust Mehrabi Sohrabi Ardalan Dehghan Bakhtiari Ghaznavi Khosravi',
        eras: {
            classical: {
                given: {
                    m: 'Kourosh Dariush Khshayarsha Kambujiya Artakhshatra Vishtaspa Bardiya Mithradata Ariobarzan Artabanus Orontes Tissaphernes Pharnabazus Hydarnes Otanes Megabyzus Masistes Datis Artaphernes Mardonius Bessus Spitamenes Oxyartes Ardashir Shapur Bahram Khosrow Yazdegerd Hormizd Peroz Kavad Narseh Ardavan Vologases Mithridates Surena Rostam Esfandiyar Zal Sam Siyavash Jamshid Fereydun Manuchehr Garshasp Afrasiab',
                    f: 'Atossa Amestris Parysatis Stateira Roxana Artystone Parmys Phaedymia Damaspia Apama Rhodogune Sisygambis Barsine Artakama Purandokht Azarmidokht Shirin Gordiya Denag Sudabeh Tahmineh Rudabeh Manijeh Faranak Katayun Gurdafarid Homay Banu Arnavaz Shahrnaz Anahita Mahbanu Dinak Kurdzad Mardanshah',
                },
                family: '',
            },
        },
        places: {
            words: { river: 'rud', hill: 'tappeh', mountain: 'kuh', valley: 'darreh', lake: 'daryacheh', sea: 'darya', wood: 'jangal', field: 'dasht', stone: 'sang', bridge: 'pol', island: 'jazireh', spring: 'cheshmeh', fort: 'qaleh', garden: 'bagh', town: 'shahr', black: 'siyah', white: 'sepid', red: 'sorkh', green: 'sabz', old: 'kohneh', new: 'now', high: 'boland', holy: 'moqaddas', iron: 'ahan', wolf: 'gorg', lion: 'shir', rose: 'gol', gold: 'zar', sun: 'khorshid', moon: 'mah', star: 'setareh', fire: 'atash' },
            endings: [['abad', 'town of'], ['shahr', 'city'], ['kerd', 'built by'], ['estan', 'land of'], ['dasht', 'plain'], ['bagh', 'garden'], ['kuh', 'mountain'], ['rud', 'river'], ['gerd', 'city'], ['vand', 'possessing'], ['sar', 'place of'], ['an', 'place of']],
        },
    },
    {
        id: 'arabic', label: 'Arabic', detect: ['arab', 'arabic', 'arabia', 'baghdad', 'cairo', 'damascus', 'mecca', 'medina', 'abbasid', 'umayyad', 'caliphate', 'bedouin', 'saudi', 'oman', 'yemen', 'morocco', 'emirates', 'dubai'],
        era: 'medieval', convention: 'arabic', adjective: ['i', 'iyya'],
        given: {
            m: 'Muhammad Ahmad Ali Umar Uthman Hasan Husayn Abdullah Abd_al-Rahman Ibrahim Ismail Ishaq Yaqub Yusuf Musa Harun Dawud Sulayman Idris Khalid Tariq Ziyad Hamza Abbas Jafar Zayd Bilal Salim Saad Said Malik Faisal Mansur Rashid Nasir Qasim Walid Yazid Marwan Hisham Mahmud Mustafa Karim Jamal Kamal Nur_al-Din Salah_al-Din Fadl Hamid Hakim Haytham Ilyas Jabir Nizar Rida Sami Usama Zubayr',
            f: 'Fatima Aisha Khadija Maryam Zaynab Ruqayya Umm_Kulthum Hafsa Asma Sumayya Safiyya Layla Salma Amina Halima Rabia Sakina Nafisa Shajar_al-Durr Zubayda Sitt_al-Mulk Khawla Hind Lubna Nur Yasmin Jamila Karima Samira Nadia Rania Huda Iman Dalia Farida Ghada Hayat Jumana Lina Mona Nawal Rasha Sana Suad Thurayya Widad Zahra Abla Badr Buthayna',
        },
        family: 'Haddad Khoury Nasser Saleh Mansour Hamdan Qasim Rashid Hassan Hussein Ibrahim Yousef Khalil Darwish Shami Masri Baghdadi Halabi Tamimi Qurashi Hashimi Sabbagh Najjar Attar Hijazi Shaikh Abdullah Mahmoud Mustafa Othman Farouk Jaber Hakim Kamal Karam Maalouf Sayegh Bitar Aziz Bakr Fadel Habib Jamil Murad Nadir Sharif Tahir Zaki',
        bynames: 'al-Baghdadi al-Dimashqi al-Misri al-Andalusi al-Maghribi al-Halabi al-Basri al-Kufi al-Qurashi al-Tamimi al-Kindi al-Ghazali al-Farabi al-Razi al-Tusi al-Khwarizmi al-Hashimi al-Ansari al-Makki al-Madani al-Shami al-Yamani al-Hijazi al-Najdi al-Iraqi al-Tabari al-Balkhi al-Isfahani al-Samarqandi al-Harawi',
        eras: {
            modern: {
                given: {
                    m: 'Mohammed Ahmed Ali Omar Youssef Khaled Hassan Hussein Ibrahim Mahmoud Mustafa Abdullah Abdulrahman Saeed Tariq Karim Faisal Nasser Hamza Bilal Adam Ziad Rami Sami Fadi Hadi Majed Nabil Walid Yasser Amr Hesham Marwan Basel Ghassan Jamal Kamal Samir Tamer Waleed Yazan Zaid Anas Ayman Bassam Fares Imad Mazen Nour Qusay',
                    f: 'Fatima Mariam Nour Aya Sara Layla Hana Yasmin Rana Dina Reem Lina Mona Huda Salma Amira Jana Malak Rawan Shahd Tala Zeina Farah Ghada Hiba Iman Jumana Khadija Lubna Maha Nada Noura Rasha Samar Suha Wafa Yara Zahra Aisha Asma Dalal Heba Lamia Manal Nisreen Rania Sawsan',
                },
            },
        },
        places: {
            words: { river: 'nahr', hill: 'tall', mountain: 'jabal', valley: 'wadi', lake: 'buhayra', sea: 'bahr', wood: 'ghaba', field: 'haql', stone: 'hajar', bridge: 'jisr', island: 'jazira', marsh: 'batiha', spring: 'ayn', well: 'bir', fort: 'qasr', castle: 'qala', town: 'madina', market: 'suq', oasis: 'waha', black: 'aswad', white: 'abyad', red: 'ahmar', green: 'akhdar', old: 'qadim', new: 'jadid', high: 'ali', holy: 'muqaddas', iron: 'hadid', wolf: 'dhib', lion: 'asad', palm: 'nakhla', gold: 'dhahab', moon: 'qamar', star: 'najm' },
            starts: [['Bab ', 'gate of'], ['Bir ', 'well of'], ['Ayn ', 'spring of'], ['Qasr ', 'palace of'], ['Wadi ', 'valley of'], ['Jabal ', 'mountain of'], ['Madinat ', 'city of'], ['Suq ', 'market of'], ['Ras ', 'cape of'], ['Dar ', 'house of'], ['Tall ', 'mound of']],
            endings: [['iyya', 'place of'], ['an', 'place'], ['abad', 'town (Persian)'], ['a', '']],
        },
    },
    {
        id: 'turkish', label: 'Turkish', detect: ['turkey', 'turkish', 'türkiye', 'istanbul', 'ankara', 'anatolia', 'ottoman', 'izmir'],
        era: 'modern', convention: 'western', adjective: ['li', 'lı'],
        given: {
            m: 'Mehmet Mustafa Ahmet Ali Hüseyin Hasan İbrahim İsmail Osman Yusuf Murat Ömer Ramazan Halil Süleyman Abdullah Mahmut Recep Salih Kemal Emre Burak Can Cem Deniz Efe Emir Eren Kaan Kerem Mert Onur Serkan Tolga Volkan Yiğit Arda Alp Aras Barış Batuhan Berk Doruk Ege Kaya Oğuz Selim Tarık Tuncay Umut Uğur Yasin Bora Cengiz Orhan',
            f: 'Fatma Ayşe Emine Hatice Zeynep Elif Meryem Şerife Zehra Sultan Hanife Merve Özlem Esra Yasemin Hülya Gül Derya Sevgi Selin Defne Ecrin Eylül Azra Nehir Asya Ela İrem Melis Ceren Damla Duygu Ebru Gizem İpek Leyla Nazlı Pınar Seda Sibel Tuba Yağmur Aslı Berna Canan Dilek Feride Gülşen Hande Nesrin Rabia Songül',
        },
        family: 'Yılmaz Kaya Demir Şahin Çelik Yıldız Yıldırım Öztürk Aydın Özdemir Arslan Doğan Kılıç Aslan Çetin Kara Koç Kurt Özkan Şimşek Polat Özcan Korkmaz Çakır Erdoğan Yavuz Can Acar Şen Aktaş Güler Yalçın Güneş Bozkurt Bulut Keskin Ünal Turan Gül Özer Işık Kaplan Avcı Sarı Tekin Taş Köse Yüksel Ateş Aksoy Yurt Erdem Karaca Çiftçi Uçar Akın Coşkun Tunç Duman Bayram Uysal Sönmez Kurtuluş Altun Karakaya Er Tuncer',
        eras: {
            ottoman: {
                given: {
                    m: 'Mehmed Murad Bayezid Selim Süleyman Ahmed Mustafa Osman Orhan Ibrahim Mahmud Abdülhamid Abdülmecid Abdülaziz Cem Korkud Hayreddin Piri Evliya Lütfi Rüstem Sinan Turgut Kemal Ali Hüsrev Davud Hamza Ilyas Isa Kasım Musa Yakub Yunus Zaganos Halil Tursun',
                    f: 'Hürrem Mihrimah Kösem Nurbanu Safiye Turhan Hafsa Gülbahar Mahidevran Gülfem Şah Fatma Ayşe Hatice Beyhan Esmahan Gevherhan Hümaşah Raziye Emetullah Mihrişah Pertevniyal Bezmiâlem Nakşidil Tiryal Perestu Rabia Saliha Şebsefa Gülnuş Handan Halime Dilaşub Muazzez Saliha',
                },
                family: '',
            },
        },
        bynames: 'Pasha Bey Agha Efendi Reis Kapudan Çelebi Hoca Usta Baba Dede Gazi Han',
        places: {
            words: { river: 'çay', hill: 'tepe', mountain: 'dağ', valley: 'dere', lake: 'göl', sea: 'deniz', wood: 'orman', field: 'ova', stone: 'taş', bridge: 'köprü', island: 'ada', spring: 'pınar', well: 'kuyu', fort: 'hisar', castle: 'kale', town: 'kent', village: 'köy', black: 'kara', white: 'ak', red: 'kızıl', green: 'yeşil', old: 'eski', new: 'yeni', high: 'yüksek', holy: 'kutsal', iron: 'demir', wolf: 'kurt', lion: 'aslan', eagle: 'kartal', falcon: 'doğan', gold: 'altın', silver: 'gümüş', sun: 'gün', moon: 'ay' },
            endings: [['köy', 'village'], ['hisar', 'fortress'], ['kale', 'castle'], ['tepe', 'hill'], ['dere', 'stream'], ['pınar', 'spring'], ['ova', 'plain'], ['dağ', 'mountain'], ['su', 'water'], ['lı', 'place with'], ['ler', 'people'], ['kent', 'town']],
        },
    },
    {
        id: 'hebrew', label: 'Hebrew', detect: ['israel', 'israeli', 'hebrew', 'jerusalem', 'tel aviv', 'judea', 'judah', 'biblical', 'canaan'],
        era: 'ancient', convention: 'patronym', patronym: { m: '{given} ben {father}', f: '{given} bat {father}' }, adjective: ['ite', 'i'],
        given: {
            m: 'David Shlomo Avraham Yitzhak Yaakov Moshe Aharon Yosef Binyamin Yehuda Levi Shimon Reuven Gad Asher Naftali Dan Zevulun Yissachar Efraim Menashe Yehoshua Shmuel Shaul Yonatan Eliyahu Elisha Yeshayahu Yirmiyahu Yehezkel Daniel Ezra Nehemya Mordechai Avshalom Amnon Natan Gidon Shimshon Boaz Oved Yishai Elazar Pinchas Kalev Otniel Ehud Barak Yiftach Avner Yoav Uriya Hizkiyahu Yoshiyahu Zecharya Hoshea Amos Ovadya Micha Nachum',
            f: 'Sarah Rivka Rachel Leah Miriam Devorah Ruth Naomi Esther Hannah Yael Tamar Dina Batsheva Avigail Michal Yehudit Zipporah Bilha Zilpa Hagar Keturah Yocheved Elisheva Huldah Atalya Izevel Merav Shulamit Orpah Achinoam Maacha Hadassah Shifra Pua Serach Noa Milka Tirtza Hogla Adah Tziyah Basmat Ketura Ahuva Zehava Ayala Tova Yehudit',
        },
        eras: {
            modern: {
                given: {
                    m: 'Noam David Ariel Yosef Eitan Lavi Uri Itai Amit Omer Yonatan Daniel Moshe Avraham Yehuda Eliyahu Yair Ido Tomer Gal Nadav Ron Tal Guy Oren Asaf Yoni Ziv Roee Shai Erez Nir Dor Lior Matan Ofek Raz Yuval Yoav Elad Barak Gilad Assaf Boaz Chaim Dov Ehud Meir Shlomo Tzvi',
                    f: 'Tamar Noa Maya Yael Shira Avigail Sarah Michal Hila Noya Talia Lia Romi Ella Adi Rotem Gal Shir Agam Or Liel Inbar Keren Limor Merav Orit Rinat Sigal Tali Yarden Ayelet Dafna Efrat Galit Hadar Iris Liat Maayan Neta Ofra Ronit Sivan Tova Yifat Zohar Batya Chana Dvora Esther',
                },
                family: 'Cohen Levi Mizrahi Peretz Biton Dahan Avraham Friedman Malka Azoulay Katz Yosef David Amar Ohana Hadad Gabay Ben-David Shapira Ben-Haim Levy Ashkenazi Yitzhaki Golan Carmi Barak Shalom Navon Oren Segal Adler Klein Rosenberg Goldberg Weiss Kaplan Stern Rubin Bar Tal Sharon Eilat Harel Shamir Ofer Dayan Alon Ben-Ami Yaron',
            },
        },
        places: {
            words: { river: 'nahar', hill: 'givah', mountain: 'har', valley: 'emek', lake: 'yam', sea: 'yam', wood: 'yaar', field: 'sadeh', stone: 'even', spring: 'ein', well: 'beer', fort: 'metzad', tower: 'migdal', house: 'beit', town: 'kfar', black: 'shachor', white: 'lavan', red: 'adom', green: 'yarok', old: 'yashan', new: 'chadash', high: 'ram', holy: 'kadosh', iron: 'barzel', wolf: 'zeev', lion: 'ari', olive: 'zayit', palm: 'tamar', cedar: 'erez', gold: 'zahav', light: 'or', peace: 'shalom' },
            starts: [['Beit ', 'house of'], ['Beer ', 'well of'], ['Ein ', 'spring of'], ['Kfar ', 'village of'], ['Migdal ', 'tower of'], ['Ramat ', 'height of'], ['Givat ', 'hill of'], ['Har ', 'mount'], ['Tel ', 'mound of'], ['Kiryat ', 'town of'], ['Neve ', 'oasis of'], ['Emek ', 'valley of']],
            endings: [['el', 'of God'], ['ah', ''], ['im', 'place of many'], ['ot', 'place of many'], ['on', 'place of']],
        },
    },
    {
        id: 'ancient_egyptian', label: 'Ancient Egyptian', detect: ['egypt', 'egyptian', 'pharaoh', 'nile', 'thebes', 'memphis', 'karnak', 'luxor'],
        era: 'ancient', convention: 'patronym', patronym: { m: '{given} sa {father}', f: '{given} sat {father}' }, adjective: ['ian'],
        given: {
            m: 'Amenhotep Thutmose Ramesses Seti Khufu Khafre Menkaure Sneferu Djoser Imhotep Ahmose Kamose Senusret Amenemhat Mentuhotep Intef Horemheb Ay Tutankhamun Akhenaten Smenkhkare Merneptah Siptah Psamtik Necho Taharqa Piye Shoshenq Osorkon Pinedjem Herihor Khaemwaset Amenemope Nebamun Rekhmire Senenmut Ptahhotep Kagemni Hardjedef Wenamun Sinuhe Neferhotep Paneb Sennedjem Mahu Nakht Userhat Djehuty Paser Hapu Khonsu Bakenkhonsu Maya Kenamun Ipuwer',
            f: 'Nefertiti Hatshepsut Nefertari Ankhesenamun Tiye Merit Meritaten Mutnedjmet Ahmose-Nefertari Ahhotep Tetisheri Sobekneferu Khentkaus Hetepheres Meresankh Neithhotep Merneith Isetnofret Bintanath Henuttawy Maatkare Karomama Shepenupet Amenirdis Nitocris Tuya Iset Satamun Henuttaneb Nebettawy Meryetamun Tey Taweret Baketaten Neferure Tiaa Tausret Mutemwiya Nebetah Kiya Sitre Inhapi Nodjmet Tabekenamun Tamit Renenutet Nefret Sennuwy',
        },
        places: {
            words: { river: 'iteru', hill: 'qaa', mountain: 'dju', valley: 'int', lake: 'she', sea: 'wadj-wer', field: 'sekhet', stone: 'iner', island: 'iw', marsh: 'pehu', fort: 'mnnw', house: 'per', town: 'niwt', temple: 'hwt-netjer', black: 'kem', white: 'hedj', red: 'desher', green: 'wadj', old: 'iau', new: 'ma', holy: 'djeser', gold: 'nebu', sun: 'ra', moon: 'iah', lion: 'mai', falcon: 'bik', ibis: 'hib', life: 'ankh', truth: 'maat', horizon: 'akhet' },
            starts: [['Per-', 'house of'], ['Hwt-', 'mansion of'], ['Ta-', 'land of'], ['Akhet-', 'horizon of'], ['Men-', 'enduring'], ['Djeser-', 'holy']],
            endings: [['-aten', 'of the sun disc'], ['-ra', 'of Ra'], ['-amun', 'of Amun'], ['-ptah', 'of Ptah'], ['et', 'place'], ['u', 'place']],
        },
    },
    {
        id: 'akkadian', label: 'Akkadian', detect: ['babylon', 'babylonian', 'assyria', 'assyrian', 'sumer', 'sumerian', 'akkad', 'akkadian', 'mesopotamia', 'nineveh', 'ur', 'uruk'],
        era: 'ancient', convention: 'patronym', patronym: { m: '{given} mar {father}', f: '{given} marat {father}' }, adjective: ['ian', 'ite'],
        given: {
            m: 'Sargon Naram-Sin Hammurabi Nebuchadnezzar Ashurbanipal Sennacherib Esarhaddon Tiglath-Pileser Shalmaneser Ashurnasirpal Shamshi-Adad Nabonidus Belshazzar Nabopolassar Marduk-apla-iddina Gilgamesh Enkidu Utnapishtim Etana Adapa Atrahasis Ur-Nammu Shulgi Gudea Lugalzagesi Enmerkar Lugalbanda Zimri-Lim Ibbi-Sin Rim-Sin Kurigalzu Burnaburiash Ashur-uballit Adad-nirari Tukulti-Ninurta Nabu-nasir Ea-nasir Sin-leqi-unninni Iddin-Marduk Ilu-bani Nur-Adad Puzur-Ashur Shamash-shum-ukin Warad-Sin Zababa-shuma-iddin Abi-eshuh Ammi-saduqa Itti-Marduk-balatu Nidintu-Bel',
            f: 'Enheduanna Semiramis Sammu-ramat Naqia Ku-Baba Shibtu Iltani Amat-Mamu Taram-Uram Libbali-sharrat Ninshubur Puabi Baranamtarra Shagshag Geme-Sin Ninsun Ishtar-ummi Belessunu Ahatum Lamassi Erishti-Aya Amat-Shamash Beltani Inanna-ama Kubatum Ninlil-tukulti Tabni-Ishtar Ummi-Shamash Akhatabisha Yaba Atalia Hamâ Mullissu-mukannishat Esharra-hammat Adad-guppi Nitocris Kunnunu Ana-Aya-taklaku Nanaya-shamhat',
        },
        places: {
            words: { river: 'narum', hill: 'tillum', mountain: 'shadum', valley: 'nahallum', lake: 'appārum', sea: 'tamtum', wood: 'qishtum', field: 'eqlum', stone: 'abnum', bridge: 'titurrum', island: 'nagum', marsh: 'appārum', spring: 'nagbum', fort: 'birtum', gate: 'babum', house: 'bitum', town: 'alum', temple: 'ekurrum', black: 'salmum', white: 'pesum', red: 'samum', old: 'labirum', new: 'eshshum', high: 'sharum', holy: 'ellum', iron: 'parzillum', wolf: 'barbarum', lion: 'labbum', gold: 'hurasum', sun: 'shamash', moon: 'sin', star: 'kakkabum' },
            starts: [['Dur-', 'fortress of'], ['Kar-', 'quay of'], ['Bab-', 'gate of'], ['Bit-', 'house of'], ['Al-', 'town of'], ['Til-', 'mound of']],
            endings: [['-ilim', 'of the god'], ['-Ishtar', 'of Ishtar'], ['-Ashur', 'of Ashur'], ['-Marduk', 'of Marduk'], ['-Sin', 'of the moon'], ['um', '']],
        },
    },
];
