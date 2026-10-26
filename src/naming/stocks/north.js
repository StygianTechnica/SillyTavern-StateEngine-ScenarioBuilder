// Name stocks: the Nordic and Finnic languages. See src/naming/stocks/index.js
// for the shape. Lists are space-separated, most common first.

export default [
    {
        id: 'finnish', label: 'Finnish', detect: ['finland', 'finnish', 'helsinki', 'tampere', 'turku'],
        era: 'modern', convention: 'western', adjective: ['lainen', 'i'],
        given: {
            m: 'Juhani Johannes Mikael Olavi Matti Antero Tapani Kalevi Timo Juha Mikko Jari Kari Pekka Markku Petri Antti Jukka Heikki Ville Lauri Eero Aleksi Veikko Onni Väinö Eino Toivo Oskari Ilmari Aarne Arvo Jaakko Paavo Risto Sakari Seppo Tuomas Valtteri Kalle Joonas Elias Niilo Urho Lassi Tero Ari Esko Hannu',
            f: 'Maria Helena Johanna Anneli Kaarina Marjatta Hannele Kristiina Tuula Päivi Anna Liisa Aino Eveliina Sofia Elina Sanna Minna Riitta Leena Pirjo Satu Tiina Hanna Laura Kaisa Aila Saara Inkeri Eila Kerttu Lempi Siiri Venla Ilona Elsa Hilja Helmi Lyyti Aune Senja Tyyne Vappu Ulla Oona Iida Pihla Ronja Kielo',
        },
        family: 'Korhonen Virtanen Mäkinen Nieminen Mäkelä Hämäläinen Laine Heikkinen Koskinen Järvinen Lehtonen Lehtinen Saarinen Salminen Heinonen Niemi Heikkilä Kinnunen Salonen Turunen Salo Laitinen Tuominen Rantanen Karjalainen Jokinen Mattila Savolainen Lahtinen Ahonen Hiltunen Kallio Leinonen Hirvonen Väisänen Pitkänen Aaltonen Manninen Halonen Kettunen Peltonen Ojala Rautio Kivelä Honkanen Lindqvist Huttunen Kärkkäinen Vainio Pelkonen Seppälä Oksanen Rissanen Ruotsalainen Koivisto Tikkanen Ketola Haapala Kurki',
        places: {
            words: { river: 'joki', hill: 'mäki', mountain: 'vaara', valley: 'laakso', lake: 'järvi', sea: 'meri', wood: 'metsä', field: 'pelto', stone: 'kivi', island: 'saari', marsh: 'suo', spring: 'lähde', bay: 'lahti', point: 'niemi', rapids: 'koski', black: 'musta', white: 'valko', red: 'puna', old: 'vanha', new: 'uusi', high: 'ylä', iron: 'rauta', wolf: 'susi', bear: 'karhu', birch: 'koivu', pine: 'mänty', swan: 'joutsen', moon: 'kuu', sun: 'päivä', star: 'tähti' },
            endings: [['la', 'place of'], ['lä', 'place of'], ['järvi', 'lake'], ['saari', 'island'], ['lahti', 'bay'], ['niemi', 'point'], ['koski', 'rapids'], ['mäki', 'hill'], ['joki', 'river'], ['vaara', 'fell']],
        },
    },
    {
        id: 'icelandic', label: 'Icelandic', detect: ['iceland', 'icelandic', 'reykjavik', 'reykjavík', 'akureyri', 'westfjords'],
        era: 'modern', convention: 'icelandic', adjective: ['ingur', 'skur'],
        given: {
            m: 'Jón Sigurður Guðmundur Gunnar Ólafur Einar Kristján Magnús Stefán Jóhann Björn Árni Helgi Bjarni Pétur Halldór Páll Þórður Ragnar Arnar Aron Alexander Daníel Kristinn Hjalti Óskar Haraldur Gísli Davíð Viktor Jóhannes Hilmar Brynjar Atli Egill Elías Birgir Snorri Ari Sindri Kári Ingólfur Þorsteinn Eiríkur Hrafn Baldur Hallgrímur Ásgeir Benedikt Hlynur Ívar Tómas Steinar Úlfur Logi Orri Bragi',
            f: 'Guðrún Anna Sigríður Kristín Margrét Helga Sigrún Ingibjörg María Jóhanna Katrín Elín Ásta Hildur Ragnheiður Guðný Eva Þóra Birna Sara Steinunn Ólöf Edda Hulda Auður Björk Lilja Hrafnhildur Ingunn Bryndís Dagný Erla Freyja Halla Harpa Inga Jórunn Kolbrún Rakel Rannveig Sólveig Svanhildur Unnur Vigdís Þórdís Embla Saga Iðunn Hekla Tinna Ylfa Ástrós Védís',
        },
        eras: {
            medieval: {
                given: {
                    m: 'Þórður Sigurður Ketill Þorsteinn Bjarni Grímur Þorgeir Hallur Gizur Snorri Sturla Egill Njáll Gunnar Flosi Kári Höskuldur Skarphéðinn Hrafn Þorkell Ásbjörn Önundur Þórólfur Ingólfur Hjörleifur Eyvindur Úlfur Steinþór Bárður Glúmur Grettir Atli Hallbjörn Ari Þorvaldur Vermundur Arnkell Bolli Kjartan Ólafur Hrútur Mörður Valgarður Þráinn Teitur Ísleifur Brandur',
                    f: 'Guðrún Þórdís Hallgerður Bergþóra Unnur Auður Þorgerður Ásgerður Hildigunnur Helga Steinunn Ingibjörg Valgerður Þuríður Jórunn Ragnhildur Halldóra Ólöf Álfdís Arnkatla Ásdís Geirríður Gróa Hrefna Oddný Sigríður Ástríður Þóra Yngvildur Vigdís Þorbjörg Gunnhildur Kolfinna Ljót',
                },
            },
        },
        places: {
            words: { river: 'á', hill: 'hóll', mountain: 'fell', valley: 'dalur', lake: 'vatn', sea: 'sjór', wood: 'skógur', field: 'völlur', stone: 'steinn', ford: 'vað', island: 'ey', marsh: 'mýri', spring: 'hver', bay: 'vík', fjord: 'fjörður', farm: 'staðir', black: 'svart', white: 'hvít', red: 'rauð', old: 'gamla', high: 'há', holy: 'helga', iron: 'járn', wolf: 'úlf', raven: 'hrafn', smoke: 'reykja', ice: 'ís', fire: 'eld' },
            endings: [['vík', 'bay'], ['fjörður', 'fjord'], ['staðir', 'farmstead'], ['dalur', 'valley'], ['fell', 'mountain'], ['ey', 'island'], ['nes', 'headland'], ['hólar', 'hills'], ['höfn', 'harbour'], ['eyri', 'gravel spit']],
        },
    },
    {
        id: 'old_norse', label: 'Old Norse', detect: ['viking', 'vikings', 'norse', 'norsemen'],
        era: 'medieval', convention: 'patronym', patronym: { m: '{father}sson', f: '{father}sdottir' }, adjective: ['ish', 'ing'],
        given: {
            m: 'Harald Sigurd Ragnar Bjorn Leif Erik Olaf Gunnar Thorvald Ivar Ulf Halfdan Hakon Sven Knut Egil Grim Ketil Thorstein Orm Arne Toke Gorm Asbjorn Einar Hrolf Sigvald Vagn Thorkel Hallvard Ottar Geir Steinar Bodvar Hjalmar Orvar Floki Ubbe Rurik Sten Kolbein Skeggi Hrafn Thrain Njal Gisli Flosi Hoskuld Ingolf Sturla Agnar Alf Arnulf Brand Dag Eystein Frodi Hauk Hemming Hogni',
            f: 'Astrid Gudrun Sigrid Ragnhild Thora Ingrid Freydis Gunnhild Helga Hild Thyra Aslaug Brynhild Alfhild Asa Bergljot Dagny Estrid Gyda Herdis Ingeborg Jorunn Ragna Runa Sigrun Solveig Svanhild Thordis Tove Ulfhild Vigdis Yrsa Aud Hallgerd Gudny Thurid Ranveig Asgerd Oddny Hervor Eydis Geirlaug Hjordis Ljufa Signy Torunn Valdis',
        },
        bynames: 'Ironside Fairhair Bluetooth Forkbeard Bloodaxe Strong Old Red White Black Tall Stout Wise Proud Silent Lucky Bold Grey Fat Lame Peaceful Unruly Shield-breaker Wolf-coat Bear-shirt Skull-splitter Far-traveller Ship-breaker Sea-king Hard-ruler',
        places: {
            words: { river: 'a', hill: 'haug', mountain: 'fjall', valley: 'dal', lake: 'vatn', sea: 'sae', wood: 'skog', field: 'voll', stone: 'stein', ford: 'vad', island: 'ey', marsh: 'myr', spring: 'kelda', bay: 'vik', fjord: 'fjord', farm: 'stad', black: 'svart', white: 'hvit', red: 'raud', old: 'gamal', high: 'ha', holy: 'helga', iron: 'jarn', wolf: 'ulf', raven: 'hrafn', ash: 'ask', thor: 'thors', bear: 'bjarn', sword: 'sverd', shield: 'skjold' },
            endings: [['vik', 'bay'], ['fjord', 'fjord'], ['stad', 'stead'], ['dal', 'valley'], ['by', 'farm'], ['holm', 'islet'], ['nes', 'headland'], ['heim', 'home'], ['gard', 'enclosure'], ['thorp', 'hamlet']],
        },
    },
    {
        id: 'norwegian', label: 'Norwegian', detect: ['norway', 'norwegian', 'oslo', 'bergen', 'trondheim', 'tromsø', 'tromso'],
        era: 'modern', convention: 'western', adjective: ['sk', 'ing'],
        given: {
            m: 'Jan Per Bjørn Ole Lars Kjell Knut Arne Svein Thomas Hans Geir Tor Morten Terje Odd Erik Martin Andreas Rune Trond John Anders Harald Olav Jon Espen Tore Øyvind Kristian Stian Magnus Henrik Even Sindre Sigurd Eirik Håkon Vegard Jørgen Aksel Emil Jakob Mathias Sander Tobias Isak Kasper Ivar Halvor',
            f: 'Anne Inger Kari Marit Ingrid Liv Eva Berit Astrid Bjørg Hilde Anna Solveig Marianne Randi Ida Nina Ragnhild Elisabeth Kristin Bente Heidi Silje Tone Hanne Gunn Grete Turid Ingeborg Tove Sigrid Marte Ane Kristine Ingvild Siri Synnøve Guro Maren Nora Emma Sara Thea Ingeborg Frida Tuva Hedda Live Selma',
        },
        family: 'Hansen Johansen Olsen Larsen Andersen Pedersen Nilsen Kristiansen Jensen Karlsen Johnsen Pettersen Eriksen Berg Haugen Hagen Johannessen Andreassen Jacobsen Dahl Jørgensen Halvorsen Henriksen Lund Sørensen Jakobsen Moen Gundersen Iversen Strand Solberg Svendsen Eide Knutsen Martinsen Paulsen Bakken Kristoffersen Mathisen Lie Amundsen Rasmussen Lunde Solheim Berge Moe Nygård Bakke Kristensen Fredriksen Holm Lien Hauge Christensen Andresen Nielsen Knudsen Evensen Sæther Aas Myhre Hanssen Haugland Thomassen Sivertsen Simonsen Danielsen Berntsen Sandvik Rønning Arnesen Antonsen Næss Vik Haug Ellingsen Thorsen Edvardsen Birkeland Isaksen Gulbrandsen Ruud Aasen Strøm Myklebust Tangen Ødegård Eliassen Helland Bøe Jenssen Aune Mikkelsen Tveit Brekke Abrahamsen Madsen',
        oldFamily: 'Haugen Hagen Berg Dahl Lund Moen Strand Solberg Eide Bakken Lie Lunde Solheim Berge Moe Nygård Bakke Holm Lien Hauge Sæther Aas Myhre Haugland Sandvik Rønning Næss Vik Haug Birkeland Ruud Aasen Strøm Myklebust Tangen Ødegård Helland Bøe Aune Tveit Brekke Rygg Lia Hovde Bjørke Flaten Nordby Sletten Vold Engen Gjerde Hovland Kvam Lyngstad Rustad Skjelbred Teigen Vatne',
        places: {
            words: { river: 'elv', hill: 'haug', mountain: 'fjell', valley: 'dal', lake: 'vann', sea: 'sjø', wood: 'skog', field: 'voll', stone: 'stein', island: 'øy', marsh: 'myr', bay: 'vik', fjord: 'fjord', farm: 'gard', black: 'svart', white: 'kvit', red: 'rød', old: 'gamle', new: 'ny', high: 'høy', holy: 'hellig', iron: 'jern', wolf: 'ulv', birch: 'bjørk', pine: 'furu' },
            endings: [['vik', 'bay'], ['fjord', 'fjord'], ['dal', 'valley'], ['heim', 'home'], ['stad', 'stead'], ['øy', 'island'], ['nes', 'headland'], ['berg', 'mountain'], ['sund', 'strait'], ['rud', 'clearing']],
        },
    },
    {
        id: 'swedish', label: 'Swedish', detect: ['sweden', 'swedish', 'stockholm', 'gothenburg', 'göteborg', 'malmö', 'uppsala'],
        era: 'modern', convention: 'western', adjective: ['isk', 'ing'],
        given: {
            m: 'Lars Karl Erik Anders Per Mikael Johan Olof Nils Jan Lennart Gustav Hans Peter Sven Fredrik Bengt Bo Daniel Åke Göran Magnus Stefan Ulf Henrik Mats Björn Bertil Oskar Axel Viktor Gunnar Leif Sten Ingemar Kjell Rolf Torbjörn Hugo Elias Wilhelm Linus Albin Ludvig Arvid Sixten Folke Tage Valter',
            f: 'Maria Elisabeth Anna Kristina Margareta Eva Birgitta Karin Ingrid Marie Lena Kerstin Ulla Sofia Linnea Emma Ingegerd Inger Sara Gunilla Monica Annika Helena Susanne Elin Malin Johanna Agneta Ida Hanna Astrid Märta Signe Greta Ebba Saga Alva Selma Elsa Siv Britt Ylva Tove Frida Moa Wilma Agnes Klara Majken Sigrid',
        },
        family: 'Andersson Johansson Karlsson Nilsson Eriksson Larsson Olsson Persson Svensson Gustafsson Pettersson Jonsson Jansson Hansson Bengtsson Jönsson Lindberg Jakobsson Magnusson Olofsson Lindström Lindqvist Lindgren Axelsson Berg Bergström Lundberg Lind Lundgren Lundqvist Mattsson Berglund Fredriksson Sandberg Henriksson Forsberg Sjöberg Wallin Engström Eklund Danielsson Lundin Håkansson Björk Bergman Gunnarsson Holm Wikström Samuelsson Isaksson Fransson Bergqvist Nyström Holmberg Arvidsson Löfgren Söderberg Nyberg Blomqvist Claesson Nordström Mårtensson Lundström Viklund Björklund Eliasson Pålsson Berggren Sandström Lund Nordin Ström Åberg Hermansson Ekström Holmgren Sundberg Hedlund Dahlberg Hellström Sjögren Abrahamsson Martinsson Öberg Andreasson Strömberg Månsson Åkesson Hansen Norberg Lindholm Dahl Jonasson',
        places: {
            words: { river: 'å', hill: 'backe', mountain: 'fjäll', valley: 'dal', lake: 'sjö', sea: 'hav', wood: 'skog', field: 'åker', stone: 'sten', island: 'ö', marsh: 'mosse', bay: 'vik', farm: 'gård', black: 'svart', white: 'vit', red: 'röd', old: 'gamla', new: 'ny', high: 'hög', holy: 'helga', iron: 'järn', wolf: 'varg', birch: 'björk', oak: 'ek', lynx: 'lo' },
            endings: [['köping', 'market town'], ['by', 'village'], ['torp', 'croft'], ['sta', 'stead'], ['holm', 'islet'], ['berg', 'mountain'], ['vik', 'bay'], ['ryd', 'clearing'], ['hult', 'grove'], ['hamn', 'harbour']],
        },
    },
    {
        id: 'danish', label: 'Danish', detect: ['denmark', 'danish', 'copenhagen', 'aarhus', 'odense'],
        era: 'modern', convention: 'western', adjective: ['sk', 'ing'],
        given: {
            m: 'Peter Jens Lars Michael Henrik Søren Thomas Jan Niels Morten Anders Jesper Hans Martin Christian Rasmus Mads Kim Per Poul Jørgen Ole Erik Frederik Torben Bent Carsten Steen Mogens Knud Kasper Mikkel Jakob Emil Magnus Oliver Viktor Aksel Asger Esben Bjarke Troels Valdemar Svend Holger Palle Flemming Ib Kaj',
            f: 'Anne Kirsten Mette Hanne Anna Helle Susanne Lene Maria Marianne Inge Karen Lone Bente Camilla Pia Louise Charlotte Jette Tina Gitte Lise Birgitte Ida Julie Line Signe Freja Emma Clara Karla Agnes Asta Ingrid Sofie Ellen Dagmar Ulla Grethe Tove Vibeke Merete Rikke Tine Maja Liva Astrid Esther Alma',
        },
        family: 'Nielsen Jensen Hansen Pedersen Andersen Christensen Larsen Sørensen Rasmussen Jørgensen Petersen Madsen Kristensen Olsen Thomsen Christiansen Poulsen Johansen Møller Mortensen Knudsen Jakobsen Jacobsen Mikkelsen Olesen Frederiksen Laursen Henriksen Lund Schmidt Eriksen Holm Kristiansen Clausen Simonsen Svendsen Andreasen Iversen Jeppesen Mogensen Jespersen Nissen Lauridsen Frandsen Østergaard Jepsen Kjær Carlsen Vestergaard Jessen Nørgaard Dahl Christoffersen Skov Søndergaard Bertelsen Bruun Lassen Bach Gregersen Friis Johnsen Steffensen Kjeldsen Bech Krogh Lauritsen Danielsen Mathiesen Andresen Brandt Winther Toft Ravn Mathiasen Dam Holst Nilsson Lind Berg Schou Overgaard Kristoffersen Schultz Klausen Karlsen Paulsen Hermansen Thorsen Koch Thygesen',
        places: {
            words: { river: 'å', hill: 'høj', valley: 'dal', lake: 'sø', sea: 'hav', wood: 'skov', field: 'mark', stone: 'sten', island: 'ø', marsh: 'mose', bay: 'vig', farm: 'gård', black: 'sort', white: 'hvid', red: 'rød', old: 'gamle', new: 'ny', high: 'høj', holy: 'hellig', iron: 'jern', wolf: 'ulv', oak: 'eg', beech: 'bøg' },
            endings: [['by', 'village'], ['rup', 'hamlet'], ['strup', 'hamlet'], ['løse', 'meadow'], ['lev', 'inheritance'], ['sted', 'stead'], ['købing', 'market town'], ['holm', 'islet'], ['borg', 'castle'], ['havn', 'harbour']],
        },
    },
];
