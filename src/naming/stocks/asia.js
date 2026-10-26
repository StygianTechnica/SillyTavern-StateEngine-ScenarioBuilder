// Name stocks: South, East and Southeast Asia. See src/naming/stocks/index.js
// for the shape.

export default [
    {
        id: 'sanskrit', label: 'Sanskrit', detect: ['vedic', 'sanskrit', 'mahabharata', 'ramayana', 'maurya', 'gupta empire', 'ancient india'],
        era: 'classical', convention: 'patronym', patronym: { m: '{given}, son of {father}', f: '{given}, daughter of {father}' }, adjective: ['an', 'ya'],
        given: {
            m: 'Arjuna Bhima Yudhishthira Nakula Sahadeva Karna Drona Bhishma Krishna Balarama Rama Lakshmana Bharata Shatrughna Dasharatha Janaka Vishvamitra Vasishtha Agastya Bharadvaja Parashurama Abhimanyu Ghatotkacha Drupada Dhrishtadyumna Shikhandi Ashvatthama Kripa Shalya Jayadratha Duryodhana Duhshasana Vidura Sanjaya Vyasa Valmiki Kalidasa Chanakya Chandragupta Bindusara Ashoka Samudragupta Harsha Kanishka Panini Aryabhata Varahamihira Brahmagupta Sushruta Charaka Patanjali Nagarjuna Bhoja Vikramaditya Shudraka',
            f: 'Sita Draupadi Kunti Gandhari Madri Subhadra Uttara Rukmini Satyabhama Radha Yashoda Devaki Damayanti Savitri Shakuntala Urvashi Menaka Tilottama Ahalya Anasuya Arundhati Kaushalya Kaikeyi Sumitra Mandodari Tara Urmila Mandavi Shrutakirti Ganga Satyavati Amba Ambika Ambalika Hidimbi Ulupi Chitrangada Lopamudra Maitreyi Gargi Lilavati Sanghamitra Kumaradevi Prabhavati Rajyashri Padmavati Sanyogita Vasavadatta Malavika',
        },
        bynames: 'the Great the Wise the Just the Wanderer the Archer the Seer the Ascetic the Victorious the Learned the Mighty',
        places: {
            words: { river: 'nadi', hill: 'giri', mountain: 'parvata', valley: 'droni', lake: 'sarovara', sea: 'samudra', wood: 'vana', field: 'kshetra', stone: 'shila', island: 'dvipa', spring: 'kunda', fort: 'durga', town: 'pura', city: 'nagara', village: 'grama', black: 'krishna', white: 'shveta', red: 'rakta', gold: 'hiranya', old: 'purana', new: 'nava', high: 'uttama', holy: 'punya', iron: 'ayas', wolf: 'vrika', lion: 'simha', elephant: 'gaja', lotus: 'padma', sun: 'surya', moon: 'chandra', star: 'tara', fire: 'agni', victory: 'jaya' },
            endings: [['pura', 'city'], ['nagara', 'city'], ['grama', 'village'], ['puri', 'town'], ['giri', 'hill'], ['vana', 'forest'], ['kshetra', 'field'], ['durga', 'fortress'], ['avati', 'having'], ['desha', 'land'], ['prastha', 'plateau'], ['ghat', 'river steps']],
        },
    },
    {
        id: 'hindi', label: 'Hindi', detect: ['india', 'indian', 'delhi', 'mumbai', 'bombay', 'kolkata', 'calcutta', 'jaipur', 'lucknow', 'varanasi', 'punjab', 'rajasthan', 'mughal'],
        era: 'modern', convention: 'western', adjective: ['i', 'an'],
        given: {
            m: 'Rahul Amit Rajesh Suresh Sanjay Vijay Anil Sunil Ramesh Ravi Ajay Manoj Deepak Ashok Vikram Arjun Rohan Aditya Aarav Vihaan Vivaan Reyansh Ayaan Krishna Ishaan Kabir Arnav Dhruv Shaurya Advik Atharv Pranav Siddharth Nikhil Gaurav Karan Varun Kunal Mohit Abhishek Harsh Yash Anand Prakash Ganesh Mahesh Naresh Dinesh Mukesh Rakesh Raj Dev Hari Shiv Om Manish Pankaj Tarun Vinod',
            f: 'Priya Anjali Pooja Neha Sunita Anita Kavita Rekha Geeta Meena Seema Sangeeta Lakshmi Saraswati Parvati Durga Radha Sita Aaradhya Ananya Diya Saanvi Aadhya Kiara Myra Pari Anika Navya Ira Riya Shreya Tanvi Isha Kavya Nisha Divya Swati Shweta Aishwarya Deepika Madhuri Rani Kajol Shilpa Vidya Usha Asha Lata Nandini Padma Shanti Uma Jyoti Kiran Mamta',
        },
        family: 'Sharma Verma Gupta Singh Kumar Yadav Mishra Pandey Tiwari Shukla Srivastava Agarwal Jain Patel Shah Mehta Joshi Chauhan Rathore Rajput Thakur Chaudhary Saxena Kapoor Malhotra Khanna Arora Bhatia Sethi Chopra Kohli Bose Banerjee Chatterjee Mukherjee Das Dutta Sen Ghosh Roy Nair Menon Pillai Reddy Rao Naidu Iyer Iyengar Desai Kulkarni Patil Deshmukh Jadhav Pawar Shinde Gaikwad Bhatt Trivedi Dwivedi Chaturvedi Dubey Tripathi Upadhyay Bajpai Awasthi Dixit Goswami Bhardwaj Kashyap Sinha Prasad Mathur Nigam',
        places: {
            words: { river: 'nadi', hill: 'pahar', mountain: 'parvat', valley: 'ghati', lake: 'jheel', sea: 'samudra', wood: 'van', field: 'khet', stone: 'patthar', bridge: 'pul', island: 'dweep', spring: 'jharna', fort: 'qila', town: 'nagar', city: 'shahar', village: 'gaon', market: 'bazaar', black: 'kala', white: 'safed', red: 'lal', green: 'hara', old: 'purana', new: 'naya', high: 'ooncha', holy: 'pavitra', iron: 'loha', lion: 'sher', tiger: 'bagh', elephant: 'hathi', lotus: 'kamal', sun: 'suraj', moon: 'chand', gold: 'sona' },
            endings: [['pur', 'town'], ['abad', 'city'], ['nagar', 'town'], ['ganj', 'market'], ['garh', 'fort'], ['gaon', 'village'], ['puram', 'town'], ['bad', 'city'], ['wadi', 'garden'], ['kot', 'fort'], ['ghat', 'riverside']],
        },
        streets: ['{word} Marg', '{family} Road', '{word} Gali', '{word} Chowk', 'MG Road', 'Station Road', '{word} Bazaar'],
        businesses: ['{family} Sweets', '{given} Tea Stall', '{family} & Sons', 'Hotel {word}', '{given} General Store', 'Shree {given} Traders'],
    },
    {
        id: 'tamil', label: 'Tamil', detect: ['tamil', 'chennai', 'madras', 'madurai', 'tamil nadu', 'chola', 'pandya', 'sri lanka'],
        era: 'modern', convention: 'tamil', adjective: ['an'],
        given: {
            m: 'Murugan Karthik Senthil Arun Ganesh Saravanan Kumar Ramesh Suresh Vijay Ajith Surya Vikram Dhanush Prakash Selvam Balaji Raja Kannan Anand Mani Shankar Venkatesh Krishnan Siva Muthu Pandian Velu Arivu Ilango Kathir Magizh Nilavan Thamizh Vetri Yazhan Aadhavan Anbu Bharathi Elango Inian Kavin Maran Nandhan Pugazh Sembiyan Thiru Vasanth Valavan Karikalan Rajaraja',
            f: 'Lakshmi Meena Priya Divya Kavitha Revathi Saranya Deepa Anitha Gayathri Sangeetha Selvi Malathi Valli Kamala Shanthi Vani Bhuvana Ilakkiya Kayal Kanmani Mathi Nila Oviya Poongodi Thendral Yazhini Aishwarya Abirami Bharathi Elakkiya Inbavalli Kaviya Madhumitha Nandhini Ponni Sudha Tamilselvi Vennila Vidhya Kannagi Madhavi Manimegalai Andal Avvai Kundavai Sembiyan Tharani Mugil',
        },
        places: {
            words: { river: 'aaru', hill: 'malai', mountain: 'malai', valley: 'pallathakku', lake: 'eri', sea: 'kadal', wood: 'kaadu', field: 'vayal', stone: 'kal', bridge: 'paalam', island: 'theevu', spring: 'ootru', fort: 'kottai', town: 'oor', city: 'nagaram', village: 'kiraamam', temple: 'kovil', black: 'karuppu', white: 'vellai', red: 'sivappu', green: 'pachai', old: 'pazhaya', new: 'puthiya', high: 'uyar', holy: 'thiru', iron: 'irumbu', tiger: 'puli', elephant: 'yaanai', peacock: 'mayil', lotus: 'thamarai', sun: 'suriyan', moon: 'nilavu', gold: 'ponnu' },
            endings: [['palayam', 'settlement'], ['puram', 'town'], ['oor', 'town'], ['kottai', 'fort'], ['patti', 'village'], ['kulam', 'tank'], ['malai', 'hill'], ['nagar', 'town'], ['pettai', 'market'], ['kudi', 'hamlet']],
            starts: [['Thiru', 'sacred'], ['Kanchi', 'golden'], ['Vada', 'northern'], ['Then', 'southern'], ['Periya', 'great'], ['Chinna', 'little']],
        },
    },
    {
        id: 'mongolian', label: 'Mongolian', detect: ['mongol', 'mongolia', 'mongolian', 'steppe', 'khan', 'khanate', 'genghis', 'ulaanbaatar', 'karakorum'],
        era: 'medieval', convention: 'patronym', patronym: { m: '{father}yn {given}', f: '{father}yn {given}' }, adjective: ['ic', 'an'],
        given: {
            m: 'Temüjin Jochi Chagatai Ögedei Tolui Batu Möngke Kublai Hülegü Berke Güyük Jebe Subutai Muqali Bo\'orchu Jelme Khasar Belgutei Kaidu Arigh Nogai Orda Shiban Toqta Özbeg Abaqa Arghun Ghazan Tamerlane Esen Dayan Altan Ligdan Galdan Amarsanaa Sükhbaatar Choibalsan Batbayar Ganbold Bat-Erdene Erdenebat Gantulga Tömörbaatar Enkhbayar Batzorig Chinggis Tsogt Gerelt Oyunbold Munkh Naran Dorj Bold Sükh Tulga Ölziibat',
            f: 'Hoelun Börte Sorghaghtani Töregene Oghul Khutulun Mandukhai Chabi Doquz Kökejin Alaqai Checheyigen Tümelün Al-Altan Qojin Yesüi Yesügen Ibaqa Khulan Gürbesü Bayalun Ölziit Saran Altantsetseg Oyuunchimeg Enkhtuya Bolormaa Tsetseg Narantsetseg Erdenechimeg Sarangerel Gerelmaa Altanzul Munkhtsetseg Uyanga Anu Khongorzul Nomin Solongo Tuya Enkhjargal Oyunaa Delgermaa Badamkhand Jargal Naran Tsolmon Sarnai',
        },
        places: {
            words: { river: 'gol', hill: 'tolgoi', mountain: 'uul', valley: 'khöndii', lake: 'nuur', sea: 'dalai', wood: 'oi', field: 'tal', stone: 'chuluu', ford: 'garam', bridge: 'güür', island: 'aral', marsh: 'namag', spring: 'bulag', fort: 'kherem', town: 'khot', black: 'khar', white: 'tsagaan', red: 'ulaan', green: 'nogoon', blue: 'khökh', yellow: 'shar', old: 'khuuchin', new: 'shine', high: 'öndör', holy: 'bogd', iron: 'tömör', wolf: 'chono', eagle: 'bürged', horse: 'mori', gold: 'altan', silver: 'möngön', sky: 'tenger' },
            endings: [['khot', 'city'], ['baatar', 'hero'], ['nuur', 'lake'], ['uul', 'mountain'], ['gol', 'river'], ['bulag', 'spring'], ['tal', 'steppe'], ['khan', 'lord']],
            starts: [['Ulaan', 'red'], ['Khar', 'black'], ['Tsagaan', 'white'], ['Altan', 'golden'], ['Khökh', 'blue'], ['Ikh', 'great'], ['Baga', 'little']],
        },
    },
    {
        id: 'japanese', label: 'Japanese', detect: ['japan', 'japanese', 'tokyo', 'kyoto', 'osaka', 'edo', 'samurai', 'shogun', 'shogunate', 'nippon', 'hokkaido', 'meiji', 'sengoku'],
        era: 'modern', convention: 'family_first', adjective: ['ese'],
        given: {
            m: 'Hiroshi Takashi Makoto Kenji Satoshi Yuki Daisuke Takuya Kazuki Shota Haruto Yuto Sota Yuma Riku Hinata Minato Sora Ren Kaito Takumi Yamato Kenta Ryota Hayato Naoki Tomoya Shun Koji Akira Masashi Tetsuya Yusuke Kazuya Ryo Shinji Tatsuya Hideki Nobuo Toshio Yoshio Kiyoshi Isamu Susumu Osamu Tadashi Minoru Shigeru Haruki Ichiro Jiro Taro Goro',
            f: 'Yoko Keiko Yumiko Akiko Kazuko Michiko Naoko Sachiko Tomoko Emiko Yuko Junko Kyoko Mayumi Megumi Ayumi Yui Aoi Hina Sakura Mei Yuna Rin Mio Himari Akari Kokona Saki Haruka Misaki Nanami Ayaka Asuka Natsuki Chihiro Kaori Shiori Mai Rei Hana Kana Momoko Nozomi Chie Fumiko Haruko Hiroko Kimiko Noriko Reiko Setsuko Toshiko',
        },
        family: 'Sato Suzuki Takahashi Tanaka Watanabe Ito Yamamoto Nakamura Kobayashi Kato Yoshida Yamada Sasaki Yamaguchi Matsumoto Inoue Kimura Hayashi Shimizu Yamazaki Mori Abe Ikeda Hashimoto Yamashita Ishikawa Nakajima Maeda Fujita Ogawa Goto Okada Hasegawa Murakami Kondo Ishii Saito Sakamoto Endo Aoki Fujii Nishimura Fukuda Ota Miura Fujiwara Okamoto Matsuda Nakagawa Nakano Harada Ono Tamura Takeuchi Kaneko Wada Nakayama Ishida Ueda Morita Hara Shibata Sakai Kudo Yokoyama Miyazaki Miyamoto Uchida Takagi Ando Taniguchi Ohno Maruyama Imai Takada Fujimoto Takeda Murata Ueno Sugiyama Masuda Sugawara Hirano Otsuka Chiba Kubo Matsui Iwasaki Sakurai Kinoshita Noguchi Matsuo Nomura Kikuchi Sano Onishi Sugimoto Arai',
        eras: {
            premodern: {
                given: {
                    m: 'Nobunaga Hideyoshi Ieyasu Kenshin Shingen Masamune Mitsuhide Yukimura Musashi Kojiro Yoshitsune Yoritomo Kiyomori Masakado Takauji Yoshimitsu Yoshimasa Motonari Ujiyasu Katsuie Toshiie Kiyomasa Yoshitaka Nagamasa Mitsunari Tadakatsu Naomasa Hanzo Ittosai Bokuden Sesshu Basho Ikkyu Kukai Saicho Dogen Nichiren Rikyu Sanetomo Yoshinaka Benkei Masashige Morinaga Tokimune Takeshi Saburo Shiro Hikozaemon Kagekatsu Ujimasa',
                    f: 'Murasaki Tomoe Masako Oichi Nene Chacha Hatsu Kasuga Matsu Nohime Tsuruhime Ginchiyo Kaihime Naotora Tama Yodo Shizuka Tokiwa Kesa Gio Hotoke Kogo Senju Chiyo Hanako Kiku Ume Take Kaede Fuji Tsuru Kame Yuri Hisa Sato Shige Tome',
                },
                family: 'Oda Toyotomi Tokugawa Uesugi Takeda Date Akechi Sanada Miyamoto Sasaki Minamoto Taira Fujiwara Ashikaga Hojo Mori Imagawa Shimazu Chosokabe Otomo Ryuzoji Mogami Satake Nanbu Maeda Kuroda Kato Ishida Honda Ii Sakai Sakakibara Hattori Asai Asakura Saito Matsunaga Miyoshi Hosokawa Hatakeyama Shiba Yamana Ouchi Amago Kobayakawa Kikkawa Ukita Konishi Ikeda Nabeshima Hachisuka Yamauchi Todo Gamo',
            },
        },
        places: {
            words: { river: 'kawa', hill: 'oka', mountain: 'yama', valley: 'tani', lake: 'ko', sea: 'umi', wood: 'mori', field: 'hara', stone: 'ishi', ford: 'watari', bridge: 'hashi', island: 'shima', marsh: 'numa', spring: 'izumi', fort: 'shiro', shrine: 'miya', town: 'machi', village: 'mura', black: 'kuro', white: 'shiro', red: 'aka', green: 'midori', blue: 'ao', old: 'furu', new: 'shin', high: 'taka', holy: 'kami', iron: 'tetsu', wolf: 'okami', fox: 'kitsune', crane: 'tsuru', pine: 'matsu', cedar: 'sugi', cherry: 'sakura', moon: 'tsuki', sun: 'hi', gold: 'kin', east: 'higashi', west: 'nishi', north: 'kita', south: 'minami' },
            endings: [['yama', 'mountain'], ['kawa', 'river'], ['shima', 'island'], ['saki', 'cape'], ['hara', 'plain'], ['mura', 'village'], ['machi', 'town'], ['zawa', 'marsh'], ['ta', 'rice field'], ['no', 'field'], ['oka', 'hill'], ['tani', 'valley'], ['hama', 'beach'], ['ura', 'bay'], ['zaka', 'slope'], ['hashi', 'bridge']],
        },
        businesses: ['{word}-ya', 'Izakaya {word}', '{family} Shoten', 'Ryokan {word}', 'Kissa {word}', '{word} Ramen'],
    },
    {
        id: 'korean', label: 'Korean', detect: ['korea', 'korean', 'seoul', 'busan', 'joseon', 'goryeo', 'silla', 'baekje', 'goguryeo'],
        era: 'modern', convention: 'family_first', adjective: ['an'],
        given: {
            m: 'Min-jun Seo-jun Do-yun Ye-jun Si-woo Ha-jun Ju-won Ji-ho Ji-hoon Jun-seo Hyun-woo Dong-hyun Sung-min Jae-hyun Jin-woo Woo-jin Sang-woo Tae-yang Seung-ho Young-ho Jung-ho Kyung-soo Dae-sung Joon-young Chul-soo Byung-hun Hyun-jun Kwang-soo Myung-soo Sung-ho Yong-jun Gun-woo Eun-ho Si-yoon Yu-jun Jae-won Ho-jin Tae-hoon In-ho Seok-jin Nam-joon Ho-seok Ji-min Tae-hyung Jung-kook Yoon-gi Chan-yeol Baek-hyun Kyung-ho',
            f: 'Seo-yeon Ji-woo Seo-yun Ha-eun Min-seo Ji-yoo Ha-yoon Chae-won Soo-ah Ji-a Ji-min Su-bin Ye-eun Yu-na Eun-ji Hye-jin Min-ji Ji-yeon Ji-hye Eun-young Mi-young Young-hee Kyung-hee Sun-hee Jung-hee Mi-kyung Hye-won Soo-jin Yeon-woo Da-eun Yoo-jin Na-yeon So-yeon Ga-eun Seul-gi Ye-jin Bo-young Hyo-jin Eun-bi Ha-neul Ye-rin Si-a A-rin Yoon-seo Chae-young Da-hyun Ji-soo',
        },
        family: 'Kim Lee Park Choi Jung Kang Cho Yoon Jang Lim Han Oh Seo Shin Kwon Hwang Ahn Song Jeon Hong Yoo Ko Moon Yang Son Bae Baek Heo Nam Shim Noh Ha Kwak Sung Cha Joo Woo Koo Min Ryu Na Jin Ji Eom Chae Won Cheon Bang Gong Hyun Ham Byun Yeom Yeo Choo Do So Seok Seon Sul Ma Gil Yeon Wi Pyo Myung Ki Ban',
        places: {
            words: { river: 'gang', hill: 'eondeok', mountain: 'san', valley: 'gol', lake: 'ho', sea: 'hae', wood: 'sup', field: 'deul', stone: 'dol', bridge: 'gyo', island: 'do', spring: 'cheon', fort: 'seong', temple: 'sa', town: 'eup', village: 'ri', black: 'heuk', white: 'baek', red: 'jeok', blue: 'cheong', gold: 'geum', old: 'gu', new: 'sin', high: 'go', holy: 'seong', iron: 'cheol', tiger: 'ho', dragon: 'yong', crane: 'hak', pine: 'song', moon: 'wol', sun: 'il', east: 'dong', west: 'seo', south: 'nam', north: 'buk' },
            endings: [['san', 'mountain'], ['gang', 'river'], ['do', 'island'], ['dong', 'neighbourhood'], ['ri', 'village'], ['seong', 'fortress'], ['sa', 'temple'], ['ju', 'district'], ['won', 'garden'], ['cheon', 'stream'], ['po', 'port'], ['gok', 'valley']],
        },
    },
    {
        id: 'mandarin', label: 'Mandarin Chinese', detect: ['china', 'chinese', 'beijing', 'shanghai', 'mandarin', 'han dynasty', 'tang dynasty', 'ming', 'qing', 'wuxia', 'xianxia', 'cultivation', 'jianghu'],
        era: 'modern', convention: 'family_first', adjective: ['ese'],
        given: {
            m: 'Wei Jie Hao Lei Jun Tao Ming Yang Bo Gang Qiang Jian Peng Hui Bin Long Feng Hai Chen Xin Yu Yi Zhi Hong Liang Kai Rui Zihan Haoran Yuxuan Zimo Yichen Junjie Zixuan Haoyu Mingyu Jiahao Zhiwei Jianguo Weimin Guoqiang Zhiqiang Xiaoming Tianyu Yifan Ruoxi Shengli Wenbo Jiale Xiaolong Zhenyu Shaoqing',
            f: 'Fang Ying Li Na Jing Min Yan Hui Juan Xia Lan Mei Hong Ping Yun Xue Qing Ling Hua Lin Xin Yi Yuxi Zihan Yutong Xinyi Ruoxi Yiran Shiyu Mengqi Xiaomei Xiaoyan Lihua Meiling Jiayi Wenjing Yaqi Shuang Huiling Qiaoyu Chunhua Xiulan Guiying Yuying Lijuan Haiyan Jingyi Yuxin Mengyao',
        },
        family: 'Wang Li Zhang Liu Chen Yang Huang Zhao Wu Zhou Xu Sun Ma Zhu Hu Guo He Gao Lin Luo Zheng Liang Xie Song Tang Han Feng Deng Cao Peng Zeng Xiao Tian Dong Yuan Pan Cai Jiang Yu Du Ye Cheng Su Wei Lu Ding Ren Shen Yao Jin Lü Fu Zhong Cui Tan Shi Fan Wan Xia Qiu Jia Fang Bai Kong Mao Hao Qin Yan Duan Lei Hou Long Shao Meng Wen Shang Ouyang Situ Zhuge Sima Shangguan Murong Dongfang',
        eras: {
            imperial: {
                given: {
                    m: 'Liang Yu Fei Chao Yun Bei Quan Shu Wen Qi Tong Xiu Heng Zhi Yan Shun Ji Ming Ling Hao Xuan Rong Zhen Dian Jing Wei Ying Kang Xun Zhao Yi Gong Mian Su Ru Chang Kui Biao Sheng Lian Ao Han Shou Feng Hu',
                    f: 'Zhaojun Xishi Diaochan Guifei Xiaoqiao Daqiao Wenji Lanzhi Hongyu Yingtai Mulan Zetian Qingzhao Yuhuan Feiyan Hede Lizhi Yuji Shuzhen Wanyu Xiangjun Ruyi Lanying Qiaoyun Baochai Daiyu Xiangyun Yuanchun Tanchun Xichun Miaoyu Qingwen Xiren Yuanyang Pinger',
                },
            },
        },
        places: {
            words: { river: 'he', hill: 'qiu', mountain: 'shan', valley: 'gu', lake: 'hu', sea: 'hai', wood: 'lin', field: 'tian', stone: 'shi', ford: 'du', bridge: 'qiao', island: 'dao', marsh: 'ze', spring: 'quan', fort: 'cheng', pass: 'guan', town: 'zhen', village: 'cun', temple: 'si', black: 'hei', white: 'bai', red: 'hong', green: 'qing', gold: 'jin', jade: 'yu', old: 'gu', new: 'xin', high: 'gao', holy: 'sheng', iron: 'tie', wolf: 'lang', tiger: 'hu', dragon: 'long', phoenix: 'feng', crane: 'he', pine: 'song', moon: 'yue', sun: 'ri', cloud: 'yun', east: 'dong', west: 'xi', south: 'nan', north: 'bei' },
            endings: [['shan', 'mountain'], ['he', 'river'], ['hu', 'lake'], ['cheng', 'city'], ['zhen', 'town'], ['cun', 'village'], ['guan', 'pass'], ['zhou', 'prefecture'], ['jing', 'capital'], ['men', 'gate'], ['gu', 'valley'], ['ling', 'ridge'], ['tai', 'terrace'], ['si', 'temple']],
        },
        businesses: ['{word} Teahouse', '{family} Family Restaurant', '{word}{word} Lou', 'Golden {noun} Inn', '{family} Pharmacy'],
    },
    {
        id: 'vietnamese', label: 'Vietnamese', detect: ['vietnam', 'vietnamese', 'hanoi', 'saigon', 'ho chi minh city', 'hue', 'mekong'],
        era: 'modern', convention: 'vietnamese', adjective: ['ese'],
        given: {
            m: 'Anh Minh Huy Hùng Dũng Tuấn Nam Long Hải Sơn Thắng Quang Phúc Bảo Khang Khôi Đức Trung Hiếu Phong Tâm Toàn Việt Thành Tài Thịnh Kiên Lâm Hoàng Hưng Khánh Lợi Nhân Quân Tiến Trí Vinh Vũ Duy Đạt Hào Khoa Lộc Luân Nghĩa Nhật Phát Quốc Tú',
            f: 'Linh Lan Hương Mai Hoa Ngọc Thảo Trang Hằng Hà Phương Thu Nga Nhung Yến Vy Anh Châu Diệp Giang Hạnh Huyền Khánh Loan Ly My Nhi Như Oanh Quyên Quỳnh Tâm Thanh Thúy Thùy Trâm Tuyết Uyên Vân Xuân Diễm Đào Hiền Kim Lệ Liên Ngân Nhàn Tiên',
        },
        family: 'Nguyễn Trần Lê Phạm Hoàng Huỳnh Phan Vũ Võ Đặng Bùi Đỗ Hồ Ngô Dương Lý Đinh Đào Trương Lâm Mai Tô Trịnh Cao Hà Lương Tạ Quách Châu Thái Kiều Văn Thân Triệu Từ Lưu Tăng Quang La Vương Mạc Phùng Âu Tôn Khúc Kha Chu',
        places: {
            words: { river: 'sông', hill: 'đồi', mountain: 'núi', valley: 'thung', lake: 'hồ', sea: 'biển', wood: 'rừng', field: 'đồng', stone: 'đá', bridge: 'cầu', island: 'đảo', spring: 'suối', fort: 'thành', village: 'làng', market: 'chợ', temple: 'chùa', black: 'đen', white: 'trắng', red: 'đỏ', green: 'xanh', gold: 'vàng', old: 'cũ', new: 'mới', high: 'cao', holy: 'thánh', dragon: 'long', tiger: 'hổ', phoenix: 'phượng', lotus: 'sen', bamboo: 'tre', moon: 'trăng', sun: 'nhật', peace: 'an', east: 'đông', south: 'nam' },
            starts: [['Bến ', 'wharf of'], ['Chợ ', 'market of'], ['Làng ', 'village of'], ['Núi ', 'mount'], ['Sông ', 'river'], ['Phú ', 'prosperous'], ['Tân ', 'new'], ['Long ', 'dragon']],
            endings: [[' An', 'peace'], [' Thành', 'citadel'], [' Long', 'dragon'], [' Bình', 'calm'], [' Hòa', 'harmony'], [' Phú', 'rich'], [' Sơn', 'mountain']],
        },
    },
    {
        id: 'thai', label: 'Thai', detect: ['thailand', 'thai', 'bangkok', 'siam', 'chiang mai', 'ayutthaya', 'phuket'],
        era: 'modern', convention: 'western', adjective: ['i'],
        given: {
            m: 'Somchai Somsak Somboon Prasert Surachai Wichai Anan Boonmee Chaiwat Kittisak Nattapong Pongsak Sakda Supachai Thanakorn Thawatchai Weerapong Apichart Chakrit Ekkachai Jirayu Kasem Narong Panya Pichai Rattana Sombat Sunthorn Thaksin Uthai Wanchai Yuthana Arthit Anurak Bhumi Chatchai Decha Kriangsak Montri Niran Phichit Prayut Sarawut Teerawat Thongchai Vichai Wirot Kraisorn',
            f: 'Somsri Malee Siriporn Supaporn Kanya Pranee Ratana Sunee Wanida Achara Bussaba Chanida Duangjai Kannika Kulap Lamai Mayuree Naree Orathai Pimchanok Rungnapa Saowanee Sirikit Suda Tassanee Ubon Waraporn Yupin Anong Busaba Chalida Darunee Jintana Kanokwan Ladda Nittaya Patcharee Ploy Porntip Sasithorn Sumalee Thida Wassana Yaowalak Kamonwan Nok Mali Dao Fah',
        },
        family: 'Saetang Srisuk Wongsawat Chaiyaphum Sukhumvit Thongchai Rattanakorn Kittikachorn Chanthara Phongphaew Boonyaratglin Suwannarat Prasertsuk Siriwattana Charoensuk Nakhonchai Wongsuwan Thammasat Jaiyen Ruangrit Sangthong Chaiyasit Kaewmanee Bunnag Sukprasert Phromthong Inthasorn Yodchai Suksawat Kongkaew Rattanasak Worrawut Somboonsuk Noppakhun Chuenchom Leelawadee Panyarachun Shinawatra Vejjajiva Chuan Kraiwong Wiriya Kamolrat Anantachai Pattanakarn Srisawat Thanomsak Wattanapong Chaisiri',
        places: {
            words: { hill: 'noen', mountain: 'doi', lake: 'nong', sea: 'thale', wood: 'pa', field: 'na', stone: 'hin', bridge: 'saphan', island: 'ko', fort: 'pom', town: 'mueang', village: 'ban', temple: 'wat', black: 'dam', white: 'khao', red: 'daeng', green: 'khiao', gold: 'thong', old: 'kao', new: 'mai', high: 'sung', holy: 'saksit', elephant: 'chang', tiger: 'suea', lotus: 'bua', moon: 'chan', sun: 'tawan', star: 'dao' },
            starts: [['Ban ', 'village of'], ['Wat ', 'temple of'], ['Ko ', 'island of'], ['Doi ', 'mountain of'], ['Nong ', 'pond of'], ['Khlong ', 'canal of'], ['Mueang ', 'town of'], ['Chiang ', 'walled city of'], ['Nakhon ', 'city of']],
            endings: [['buri', 'city'], ['thani', 'city'], ['rat', 'kingdom'], ['phum', 'land'], ['nakhon', 'city'], ['wan', 'park']],
        },
    },
    {
        id: 'filipino', label: 'Filipino', detect: ['philippines', 'filipino', 'manila', 'cebu', 'luzon', 'mindanao', 'visayas', 'tagalog'],
        era: 'modern', convention: 'western', adjective: ['o', 'an'],
        given: {
            m: 'Jose Juan Antonio Mark John Michael Christian Jerome Rodel Jomar Ramil Rogelio Ernesto Romeo Danilo Eduardo Ricardo Manuel Fernando Rolando Arnel Joel Noel Rey Bong Jun-jun Paolo Miguel Gabriel Rafael Angelo Carlo Enrique Emilio Andres Apolinario Lapu-Lapu Bayani Dakila Bagwis Kidlat Lakan Makisig Tala Amado Dante Efren Manny Nonoy Totoy Jaypee Jhun',
            f: 'Maria Rosa Ana Elena Teresita Corazon Imelda Gloria Leonor Lourdes Josefina Marites Maricel Rowena Jocelyn Lorna Marilou Gemma Liza Jenny Kristine Angelica Princess Mary_Joy Mae Jasmine Nicole Andrea Bea Kathryn Liwayway Dalisay Ligaya Mayumi Tala Amihan Bituin Diwata Hiraya Luningning Marikit Sampaguita Tanglaw Malaya Mutya Perla Dolores Remedios Socorro Milagros',
        },
        family: 'Santos Reyes Cruz Bautista Ocampo Garcia Mendoza Torres Tomas Andrada Castillo Flores Villanueva Ramos Castro Rivera Aquino Navarro Salazar Mercado Dela_Cruz De_Leon Del_Rosario Gonzales Lopez Perez Fernandez Hernandez Aguilar Manalo Macaraeg Dimaculangan Dimaano Magbanua Lacson Pangilinan Panganiban Mangubat Tolentino Soriano Pascual Valdez Morales Domingo Dizon Sison Tan Lim Co Sy Ong Uy Dumalagan Bonifacio Rizal Mabini Luna Silang',
        places: {
            words: { river: 'ilog', hill: 'burol', mountain: 'bundok', valley: 'lambak', lake: 'lawa', sea: 'dagat', wood: 'gubat', field: 'bukid', stone: 'bato', bridge: 'tulay', island: 'pulo', spring: 'bukal', fort: 'kuta', town: 'bayan', village: 'nayon', black: 'itim', white: 'puti', red: 'pula', green: 'berde', gold: 'ginto', old: 'luma', new: 'bago', high: 'mataas', holy: 'banal', eagle: 'agila', carabao: 'kalabaw', coconut: 'niyog', moon: 'buwan', sun: 'araw', star: 'bituin' },
            starts: [['San ', 'Saint'], ['Santa ', 'Saint'], ['Bagong ', 'new'], ['Barangay ', 'village of'], ['Puerto ', 'port of']],
            endings: [['an', 'place of'], ['in', 'place of'], ['han', 'place of'], ['ay', ''], ['on', '']],
        },
        businesses: ["{given}'s Carinderia", '{family} Sari-Sari Store', 'Kainan ni {given}', '{word} Bakery', '{family} Lechon House'],
    },
];
