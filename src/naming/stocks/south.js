// Name stocks: Africa, the Americas and the Pacific. See
// src/naming/stocks/index.js for the shape.

export default [
    {
        id: 'swahili', label: 'Swahili', detect: ['swahili', 'kenya', 'kenyan', 'tanzania', 'tanzanian', 'zanzibar', 'mombasa', 'nairobi', 'dar es salaam'],
        era: 'modern', convention: 'western', adjective: ['i', 'an'],
        given: {
            m: 'Juma Baraka Jabari Hamisi Bakari Rashidi Omari Salim Musa Ali Hassani Abdallah Mwangi Kamau Otieno Ochieng Kipchoge Kiprono Wanjiru Mosi Pili Tatu Faraji Imani Jelani Kito Kwame Simba Tumaini Zuberi Adongo Bahati Chaka Dalili Haji Issa Jengo Kassim Kibwe Majaliwa Makame Mbaraka Mwalimu Nuru Sefu Shabani Tumaini Uledi Waziri Yusufu',
            f: 'Amani Zawadi Neema Rehema Imani Asha Halima Mwanaisha Zuhura Saida Mwajuma Fatuma Mariamu Zainabu Furaha Baraka Eshe Jamila Kesi Malaika Nia Nyokabi Wanjiku Akinyi Atieno Nafula Chausiku Dalila Hadiya Kamaria Lulu Makena Nasra Pendo Sauda Subira Tabitha Upendo Wairimu Zuri Aziza Bahati Hawa Mwanajuma Mosi Nyambura Rukia Shani',
        },
        family: 'Mwangi Kamau Otieno Ochieng Kariuki Njoroge Wanjiru Kimani Omondi Odhiambo Mutua Kiprop Kiprono Kipchoge Cheruiyot Kibet Rotich Mohamed Hamisi Juma Salim Abdallah Mfinanga Mollel Massawe Mushi Kimaro Shirima Swai Lyimo Mrema Temba Kweka Ngowi Mwakyusa Mwakalinga Mbwambo Magufuli Nyerere Kikwete Mkapa Mwinyi Karume Odinga Kenyatta Moi Kibaki Ruto Wambugu Gitau',
        places: {
            words: { river: 'mto', hill: 'kilima', mountain: 'mlima', valley: 'bonde', lake: 'ziwa', sea: 'bahari', wood: 'msitu', field: 'shamba', stone: 'jiwe', bridge: 'daraja', island: 'kisiwa', marsh: 'kinamasi', spring: 'chemchemi', fort: 'ngome', town: 'mji', village: 'kijiji', market: 'soko', black: 'nyeusi', white: 'nyeupe', red: 'nyekundu', green: 'kijani', old: 'kale', new: 'mpya', high: 'juu', holy: 'takatifu', iron: 'chuma', lion: 'simba', elephant: 'tembo', leopard: 'chui', eagle: 'tai', sun: 'jua', moon: 'mwezi', star: 'nyota', peace: 'salama' },
            starts: [['Mji wa ', 'town of'], ['Kisiwa cha ', 'island of'], ['Mlima ', 'mount'], ['Bandari ', 'harbour of']],
            endings: [['ni', 'at the place of'], ['ini', 'in the'], [' Salama', 'safe'], ['wani', 'place of']],
        },
    },
    {
        id: 'yoruba', label: 'Yoruba', detect: ['yoruba', 'nigeria', 'nigerian', 'lagos', 'ibadan', 'oyo', 'ife'],
        era: 'modern', convention: 'western', adjective: ['n'],
        given: {
            m: 'Adebayo Oluwaseun Ayodele Babatunde Olumide Femi Tunde Kayode Segun Wale Dapo Biodun Gbenga Kunle Lanre Niyi Rotimi Seyi Tobi Yemi Ade Ayo Bolaji Damilola Dayo Emeka Folarin Gbolahan Idowu Jide Kehinde Taiwo Ladi Mayowa Olamide Oladele Olufemi Olusegun Oyelaran Sola Temitope Tolu Akin Ajani Bankole Dare Ige Ojo Owolabi Sango Ogun',
            f: 'Abimbola Adunni Ayomide Bisola Bukola Damilola Folake Funmilayo Ife Ifeoluwa Iyabo Kemi Lola Modupe Morenike Ngozi Oluwakemi Omolara Omotola Oyinkansola Remilekun Ronke Sade Shola Simisola Titilayo Toyin Wuraola Yetunde Yewande Adesuwa Aduke Ayoka Banke Dupe Eniola Fadekemi Folasade Ibukun Jumoke Kehinde Taiwo Moradeke Nike Oluwatoyin Omowunmi Ronke Tinuke Yejide Osun',
        },
        family: 'Adeyemi Adebayo Okafor Olawale Ogunleye Adeleke Afolabi Akinola Alabi Babalola Bello Coker Dada Fashola Ige Jaiyeola Kolawole Lawal Makinde Ogunbiyi Ojo Okonkwo Oladipo Olaniyan Olatunji Oyelowo Salami Soyinka Tinubu Obasanjo Awolowo Akintola Adewale Adesanya Ajayi Akande Akinwande Aluko Ayodele Fagbemi Falana Kuti Ogundipe Ogunwale Olaitan Olayinka Oyebanji Oyewole Shittu',
        places: {
            words: { river: 'odo', hill: 'oke', mountain: 'oke', valley: 'afonifoji', lake: 'adagun', sea: 'okun', wood: 'igbo', field: 'oko', stone: 'okuta', bridge: 'afara', island: 'erekusu', spring: 'orisun', town: 'ilu', market: 'oja', palace: 'afin', black: 'dudu', white: 'funfun', red: 'pupa', old: 'atijo', new: 'titun', high: 'giga', holy: 'mimo', iron: 'irin', lion: 'kiniun', leopard: 'ekun', elephant: 'erin', sun: 'oorun', moon: 'osupa', crown: 'ade' },
            starts: [['Ile-', 'house of'], ['Oke-', 'hill of'], ['Iju-', 'forest of'], ['Ado-', 'town of'], ['Ijebu-', 'land of'], ['Ota-', 'stone of']],
            endings: [['-Ife', 'of love'], ['-Ekiti', 'of the hills'], ['-Odo', 'by the river'], ['-Oja', 'of the market']],
        },
    },
    {
        id: 'igbo', label: 'Igbo', detect: ['igbo', 'enugu', 'onitsha', 'owerri', 'biafra'],
        era: 'modern', convention: 'western', adjective: ['n'],
        given: {
            m: 'Chukwuemeka Chinedu Obinna Ikenna Nnamdi Emeka Chidi Chibuike Chukwudi Ifeanyi Kelechi Uchenna Okechukwu Nonso Ebuka Somto Tobenna Kenechukwu Chinonso Chijioke Ugochukwu Arinze Nnaemeka Onyekachi Azubuike Ejike Ekene Ikechukwu Izuchukwu Obiora Oluchi Onyeka Udoka Uzoma Chiedu Chimezie Chisom Dumebi Ebube Echezona Ezenwa Ifeatu Kamsi Nwachukwu Okonkwo Unoka Obi Ezeulu',
            f: 'Ngozi Chiamaka Adaeze Chioma Nneka Amaka Ifeoma Nkechi Uchechi Obiageli Adanna Chinwe Chidinma Ebere Ijeoma Kosisochukwu Nkiruka Nwakaego Ogechi Onyinye Ugochi Uju Amarachi Chinyere Ezinne Ifunanya Mmachi Nnenna Obioma Oluchi Somadina Udoka Adaku Akunna Chidimma Chimamanda Ebele Ekwutosi Ezinma Ihuoma Njideka Nwanneka Oge Ozioma Uzoamaka',
        },
        family: 'Okafor Okonkwo Nwosu Eze Okeke Nwachukwu Obi Onyeka Chukwu Okoro Okoye Nnadi Uzor Ibe Nwankwo Anyanwu Ezeh Onuoha Obiora Odinaka Agu Achebe Adichie Azikiwe Ojukwu Ekwueme Iwobi Nwankwo Mbah Nnaji Nwafor Obasi Ogbonna Okonjo Onwuka Udeh Ugwu Umeh Uzoma Ekwueme Emenike Ezenwa Igwe Nzeribe Obodo Onyejekwe',
        places: {
            words: { river: 'mmiri', hill: 'ugwu', mountain: 'ugwu', lake: 'ọdọ', wood: 'ọhịa', field: 'ubi', stone: 'nkume', town: 'obodo', market: 'ahịa', black: 'oji', white: 'ọcha', red: 'uhie', old: 'ochie', new: 'ọhụrụ', holy: 'nsọ', iron: 'igwe', lion: 'ọdụm', leopard: 'agụ', eagle: 'ugo', sun: 'anyanwụ', moon: 'ọnwa', king: 'eze' },
            starts: [['Obodo ', 'town of'], ['Ugwu ', 'hill of'], ['Ama-', 'compound of'], ['Umu-', 'children of'], ['Nkwo-', 'market of'], ['Eke-', 'market of']],
            endings: [['-ukwu', 'great'], ['-ọcha', 'white'], ['-agu', 'leopard']],
        },
    },
    {
        id: 'hausa', label: 'Hausa', detect: ['hausa', 'kano', 'kaduna', 'sokoto', 'zaria', 'katsina', 'sahel'],
        era: 'modern', convention: 'western', adjective: ['awa'],
        given: {
            m: 'Abubakar Ibrahim Musa Usman Aliyu Bello Sani Garba Haruna Yusuf Umar Muhammadu Shehu Yakubu Sule Lawal Danjuma Idris Kabiru Nasiru Rabiu Salisu Tanko Audu Bala Dauda Habibu Isa Jibril Mahmud Nuhu Saidu Tijjani Zubairu Adamu Ahmadu Balarabe Danladi Gambo Hamisu Inuwa Jafaru Lamido Mamman Sambo Tukur Yahaya Zakari',
            f: 'Aisha Fatima Hauwa Zainab Hadiza Amina Maryam Hafsat Halima Rabi Safiya Bilkisu Asabe Ladi Talatu Jummai Larai Binta Hajara Kubra Laraba Rakiya Saadatu Ummi Zuwaira Asma\'u Bariya Delu Firdausi Gaji Habiba Indo Jamila Kande Khadija Lami Maimuna Nana Rahama Salamatu Sauda Tani Uwani Yalwa Zahra',
        },
        family: 'Abubakar Ibrahim Musa Usman Bello Sani Garba Yusuf Umar Danjuma Lawal Idris Aliyu Suleiman Abdullahi Mohammed Ahmed Haruna Yakubu Shehu Dangote Buhari Tinubu Yar\'Adua Shagari Kano Katsina Sokoto Bauchi Zazzau Gwandu Fodio Dantata Rimi Kwankwaso Ganduje Masari Tambuwal Wamakko Zulum Makarfi Atiku',
        places: {
            words: { river: 'kogi', hill: 'tudu', mountain: 'dutse', lake: 'tafki', wood: 'daji', field: 'gona', stone: 'dutse', town: 'gari', market: 'kasuwa', well: 'rijiya', wall: 'ganuwa', gate: 'kofa', black: 'baki', white: 'fari', red: 'ja', old: 'tsoho', new: 'sabo', high: 'babba', holy: 'tsarki', lion: 'zaki', horse: 'doki', camel: 'rakumi', sun: 'rana', moon: 'wata' },
            starts: [['Kofar ', 'gate of'], ['Kasuwar ', 'market of'], ['Unguwar ', 'ward of'], ['Gidan ', 'house of'], ['Birnin ', 'walled city of'], ['Sabon ', 'new']],
            endings: [['awa', 'people of'], ['ri', 'place'], ['wa', 'people']],
        },
    },
    {
        id: 'nahuatl', label: 'Nahuatl', detect: ['aztec', 'aztecs', 'nahuatl', 'mexica', 'tenochtitlan', 'mesoamerica', 'mesoamerican'],
        era: 'classical', convention: 'single', adjective: ['ec', 'tec'],
        given: {
            m: 'Cuauhtémoc Moctezuma Itzcóatl Ahuitzotl Axayácatl Tízoc Nezahualcóyotl Nezahualpilli Cuitláhuac Tlacaélel Acamapichtli Huitzilíhuitl Chimalpopoca Tezozómoc Maxtla Xólotl Tlacotzin Ixtlilxóchitl Cacamatzin Coanacoch Tecuichpo Citlalli Yaotl Tochtli Mazatl Cuauhtli Ocelotl Coatl Ehecatl Mixcoatl Tenoch Itzli Tlaloc Xiuhcoatl Huemac Topiltzin Tezcatl Necalli Tlanextli Yolotl Xochipilli Zolin Teyacapan Iztac',
            f: 'Xochitl Citlali Tecuichpo Malinalli Papantzin Atotoztli Ilancueitl Matlalcueye Coyolxauhqui Chalchiuhtlicue Xilonen Mayahuel Itzpapalotl Tonantzin Cihuacoatl Yaretzi Izel Metzli Nenetl Quetzalli Tlalli Xiuhtonal Yolotli Ameyalli Atl Cueyatl Ichpochtli Itzel Necahual Nochtli Ohtli Tonalli Xiadani Xoco Zyanya Centehua Citlalmina Coszcatl Eztli Huitzitzilin Iuitl Mecatl Miyaotl Nelli Nochehuatl Quiahuitl Tlanextli Xilotl',
        },
        bynames: 'the Elder the Younger the Eagle the Jaguar the Speaker the Wise the Warrior the Priest the Merchant the Feather-worker',
        places: {
            words: { river: 'atoyatl', hill: 'tepetl', mountain: 'tepetl', valley: 'ixtlahuatl', lake: 'atezcatl', sea: 'ilhuicaatl', wood: 'cuauhtla', field: 'milli', stone: 'tetl', bridge: 'cuappantli', island: 'tlalli', marsh: 'atlacomulco', spring: 'ameyalli', water: 'atl', fort: 'tepetlacalli', town: 'altepetl', temple: 'teocalli', black: 'tliltic', white: 'iztac', red: 'chichiltic', green: 'xoxoctic', old: 'huehue', new: 'yancuic', high: 'huecapan', holy: 'teo', obsidian: 'itz', eagle: 'cuauh', jaguar: 'ocelo', serpent: 'coa', flower: 'xochi', sun: 'tonatiuh', moon: 'metz', star: 'citlal', smoke: 'popoca', rabbit: 'toch', jade: 'chalchiu' },
            endings: [['tlan', 'place of'], ['tepec', 'hill of'], ['co', 'place of'], ['pan', 'upon'], ['apan', 'river of'], ['titlan', 'near'], ['tzinco', 'little place of'], ['huacan', 'place of those who have'], ['yocan', 'place of'], ['atl', 'water'], ['pa', 'at']],
        },
    },
    {
        id: 'quechua', label: 'Quechua', detect: ['inca', 'incan', 'quechua', 'cusco', 'cuzco', 'andes', 'andean', 'peru', 'peruvian', 'machu picchu', 'tawantinsuyu'],
        era: 'classical', convention: 'single', adjective: ['an'],
        given: {
            m: 'Pachacuti Atahualpa Huáscar Huayna Túpac Manco Inti Viracocha Sinchi Lloque Mayta Cápac Yahuar Rumi Amaru Kusi Yupanqui Titu Sayri Waman Kuntur Puma Atoq Illapa Wiraqocha Ayar Rimac Tupaq Waskar Ollantay Paullu Sairi Uturunku Yawar Qhapaq Chuqi Hatun Inka Kallpa Kuntur Mallku Ninan Paqari Sami Supay Tika Unu Wayra Yachay',
            f: 'Mama_Ocllo Mama_Huaco Chaska Killa Koya Nusta Kusi Pacha Sisa Tika Urpi Wayta Yupay Asiri Ayla Chaska Inkill Kantu Kuri Mayu Nina Phuyu Qoya Sami Sumaq Suyay Taki Tamya Waylla Yaku Amaya Achiq Ch\'aska Illari Kiri Micay Ñusta Qori Sumac Tupa Wayra Yanapa Killari',
        },
        bynames: 'the Great the Younger the Elder the Wise the Victorious the Earthshaker the Condor the Puma',
        places: {
            words: { river: 'mayu', hill: 'urqu', mountain: 'urqu', valley: 'wayq\'u', lake: 'qocha', wood: 'sach\'a', field: 'chakra', stone: 'rumi', bridge: 'chaka', island: 'wat\'a', marsh: 'oqho', spring: 'pukyu', fort: 'pukara', town: 'llaqta', temple: 'wasi', black: 'yana', white: 'yuraq', red: 'puka', green: 'q\'umir', gold: 'quri', silver: 'qolqe', old: 'machu', new: 'musuq', high: 'hanan', holy: 'willka', condor: 'kuntur', puma: 'puma', serpent: 'amaru', llama: 'llama', sun: 'inti', moon: 'killa', star: 'quyllur', rain: 'para' },
            endings: [['pampa', 'plain'], ['marka', 'town'], ['wasi', 'house'], ['qocha', 'lake'], ['mayu', 'river'], ['urqu', 'mountain'], ['pata', 'terrace'], ['kancha', 'enclosure'], ['pukyu', 'spring'], ['llaqta', 'town']],
            starts: [['Machu ', 'old'], ['Wayna ', 'young'], ['Hatun ', 'great'], ['Willka ', 'sacred'], ['Inti ', 'sun']],
        },
    },
    {
        id: 'hawaiian', label: 'Hawaiian', detect: ['hawaii', 'hawaiian', 'honolulu', 'maui', 'oahu', 'kauai', 'polynesia', 'polynesian'],
        era: 'classical', convention: 'single', adjective: ['an'],
        given: {
            m: 'Kamehameha Kalani Keoni Makoa Kai Koa Kekoa Kaleo Kanoa Keahi Kawika Keola Ikaika Kainoa Kaimana Kalei Kapono Akoni Alika Ekewaka Hiapo Ioane Kahiau Kaiko Kalama Kalena Kamaka Kana Kaniela Kealoha Keawe Kekipi Keoki Kimo Koʻolau Lono Mahina Makana Malu Nalu Noa Palani Pika Umi Liholiho Lunalilo Kalākaua Kaumualiʻi Kahekili Keōua Kiwalaʻō',
            f: 'Leilani Kailani Malia Noelani Moana Nalani Alana Anuhea Haunani Hōkū Iolana Kaimana Kalena Kamalei Keala Keikilani Lani Lehua Lokelani Mahina Mālie Nāmaka Nohea Olina Pua Puanani Ululani Wailani Kaʻiulani Liliʻuokalani Keōpūolani Kaʻahumanu Kapiʻolani Kalama Kekāuluohi Pauahi Kīnaʻu Nāhiʻenaʻena Kaleleonālani Hiʻiaka Laka Pele Poliʻahu Hina',
        },
        places: {
            words: { river: 'kahawai', hill: 'puʻu', mountain: 'mauna', valley: 'awāwa', lake: 'loko', sea: 'kai', wood: 'ululāʻau', field: 'kula', stone: 'pōhaku', island: 'moku', marsh: 'ʻūhaʻi', spring: 'pūnāwai', water: 'wai', harbour: 'awa', cliff: 'pali', beach: 'one', temple: 'heiau', black: 'ʻeleʻele', white: 'keʻokeʻo', red: 'ʻula', green: 'ʻōmaʻomaʻo', old: 'kahiko', new: 'hou', high: 'kiʻekiʻe', holy: 'kapu', great: 'nui', shark: 'manō', turtle: 'honu', owl: 'pueo', sun: 'lā', moon: 'mahina', star: 'hōkū', fire: 'ahi', wind: 'makani', rain: 'ua' },
            starts: [['Wai', 'water of'], ['Pu\'u ', 'hill of'], ['Mauna ', 'mountain of'], ['Kai', 'sea of'], ['Ka', 'the'], ['Hale', 'house of'], ['Pali ', 'cliff of']],
            endings: [['nui', 'great'], ['iki', 'little'], ['lani', 'heavenly'], ['kai', 'by the sea'], ['ʻula', 'red'], ['kea', 'white'], ['loa', 'long'], ['hou', 'new']],
        },
    },
    {
        id: 'maori', label: 'Māori', detect: ['maori', 'māori', 'aotearoa', 'new zealand', 'kiwi', 'auckland', 'wellington'],
        era: 'classical', convention: 'single', adjective: ['an'],
        given: {
            m: 'Tāne Rangi Tama Wiremu Hēmi Rāwiri Mikaere Ihaia Tamati Hōhepa Pita Hone Matiu Nikau Kahu Manaia Ari Ihaka Kauri Koha Māui Nikora Rāhiri Ranginui Rēweti Rewi Tamatea Tawhiri Te_Ao Tipene Tūmatauenga Wairua Whetu Hongi Te_Rauparaha Te_Kooti Tawhiao Pōtatau Kawiti Heke Tītokowaru Rua Te_Whiti Tohu Aperahama Arapeta Eruera Hamiora',
            f: 'Aroha Hine Mere Ana Kiri Moana Ngaio Pania Rangi Tui Wikitoria Āio Anahera Ataahua Awhina Huia Kahurangi Kōwhai Mahina Manaia Marama Ngaire Ngākau Ora Pīata Rāwhiti Rēhia Tia Waimarie Whetū Hinemoa Kurangaituku Mahuika Papatūānuku Hineahuone Hinenuitepō Te_Puea Whina Rangimarie Hera Ripeka Ruihi Atareta Hūhana Maata Pare Rewa',
        },
        places: {
            words: { river: 'awa', hill: 'puke', mountain: 'maunga', valley: 'riu', lake: 'roto', sea: 'moana', wood: 'ngahere', field: 'mara', stone: 'kōhatu', bridge: 'arawhiti', island: 'motu', marsh: 'repo', spring: 'puna', water: 'wai', harbour: 'whanga', cliff: 'pari', fort: 'pā', house: 'whare', black: 'pango', white: 'mā', red: 'whero', green: 'kākāriki', old: 'tawhito', new: 'hōu', high: 'teitei', holy: 'tapu', great: 'nui', bird: 'manu', shark: 'mangō', kauri: 'kauri', sun: 'rā', moon: 'marama', star: 'whetū', wind: 'hau', cloud: 'kapua', fire: 'ahi' },
            starts: [['Wai', 'water of'], ['Roto', 'lake of'], ['Whanga', 'harbour of'], ['Motu', 'island of'], ['Puke', 'hill of'], ['Maunga', 'mountain of'], ['Te ', 'the']],
            endings: [['nui', 'great'], ['iti', 'little'], ['roa', 'long'], ['tea', 'white'], ['rua', 'two'], ['whenua', 'land'], ['kawa', 'bitter'], ['moana', 'sea']],
        },
    },
];
