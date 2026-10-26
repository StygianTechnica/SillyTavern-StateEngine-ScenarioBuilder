// Name stocks: the Celtic languages, English, German, Dutch, French and
// Basque. See src/naming/stocks/index.js for the shape.

export default [
    {
        id: 'welsh', label: 'Welsh', detect: ['wales', 'welsh', 'cardiff', 'swansea', 'snowdonia', 'cymru'],
        era: 'medieval', convention: 'patronym', patronym: { m: '{given} ap {father}', f: '{given} ferch {father}' }, adjective: ['ion', 'og'],
        given: {
            m: 'Gruffudd Llywelyn Owain Rhys Dafydd Hywel Madog Cadwgan Iorwerth Maredudd Cynan Einion Gwilym Ieuan Tudur Morgan Rhodri Cadell Bleddyn Gronw Meurig Trahaearn Caradog Elisedd Idwal Cadfan Emrys Taliesin Aneirin Gwion Bedwyr Cai Peredur Geraint Pwyll Pryderi Bran Math Gwydion Lleu Dyfrig Teilo Illtud Brychan Urien Gwalchmai Tegid Rhydderch Seisyll Cynddylan Heilyn Iolo Aled Huw',
            f: 'Gwenllian Angharad Nest Gwladys Efa Marared Tangwystl Lleucu Gwerful Annes Catrin Elen Gwenhwyfar Branwen Rhiannon Arianrhod Blodeuwedd Ceridwen Olwen Enid Luned Creirwy Dwynwen Gwen Tegau Heledd Eluned Morfudd Dyddgu Mallt Gwenddydd Nia Ffion Seren Cerys Mererid Gwawr Eirlys Bethan Mair Rhian Siân Llinos Haf Tegwen Eirwen Lowri Glesni',
        },
        family: 'Jones Williams Davies Evans Thomas Roberts Hughes Lewis Morgan Griffiths Edwards Owen Price Pritchard Powell Parry Bowen Jenkins Rees Probert Pugh Lloyd Vaughan Llewellyn Meredith Howells Prosser Bevan Gwynne Bellis Prydderch',
        places: {
            words: { river: 'afon', hill: 'bryn', mountain: 'mynydd', valley: 'cwm', lake: 'llyn', sea: 'môr', wood: 'coed', field: 'maes', stone: 'maen', ford: 'rhyd', bridge: 'pont', island: 'ynys', marsh: 'cors', spring: 'ffynnon', church: 'llan', fort: 'caer', head: 'pen', black: 'du', white: 'gwyn', red: 'coch', green: 'glas', old: 'hen', new: 'newydd', high: 'uchel', holy: 'sant', iron: 'haearn', wolf: 'blaidd', oak: 'derw', dragon: 'draig', raven: 'cigfran', star: 'seren' },
            starts: [['aber', 'river mouth'], ['llan', 'church of'], ['caer', 'fort of'], ['pen', 'head of'], ['tre', 'homestead of'], ['pont', 'bridge of'], ['rhyd', 'ford of'], ['cwm', 'valley of'], ['bryn', 'hill of'], ['nant', 'stream of'], ['llyn', 'lake of'], ['ynys', 'isle of'], ['dinas', 'fortress of']],
            endings: [['fa', 'place'], ['wy', 'river'], ['ydd', 'land'], ['og', 'of'], ['ion', 'of the people']],
        },
    },
    {
        id: 'scottish_gaelic', label: 'Scottish Gaelic', detect: ['highlands', 'hebrides', 'gaelic', 'scotland', 'scottish'],
        era: 'medieval', convention: 'patronym', patronym: { m: '{given} mac {father}', f: '{given} nic {father}' }, adjective: ['ach'],
        given: {
            m: 'Alasdair Aonghas Calum Coinneach Dòmhnall Donnchadh Dùghall Eachann Fearchar Fionnlagh Gilleasbaig Gille-Brìde Iain Lachlann Mànus Murchadh Niall Ruairidh Seumas Somhairle Tormod Uilleam Ailean Artair Brian Caluim Cinaed Conall Diarmad Eòghann Fearghas Goiridh Raghnall Ranald Ruaidhrí Seathan Torcall Uisdean Beathan Crìsdean Dàibhidh Eanraig Gòrdan Labhrainn Màrtainn Pàdraig Teàrlach',
            f: 'Mòrag Seonag Catrìona Màiri Ealasaid Iseabail Mairead Peigi Seònaid Sìne Una Barabal Beathag Ciorstaidh Deirdre Eilidh Fionnghal Flòraidh Gormal Lilidh Marsaili Mòr Muireall Oighrig Raonaid Rìoghnach Sìleas Sorcha Anna Brìghde Caitlin Ciorsdan Dìorbhal Eubh Giorsail Iseabal Lachina Mairi Mìna Raghnaid Sìleas Teasag Aileas',
        },
        prefixes: [['Mac', 85], ['Mc', 15]], femalePrefixes: { Mac: 'Nic', Mc: 'Nic' }, realPrefixes: true,
        family: 'Donald Leod Kenzie Kay Lean Gregor Intosh Pherson Kinnon Neil Millan Laren Lachlan Farlane Ewan Ian Innes Allister Arthur Aulay Beth Callum Coll Crimmon Dougall Duff Fie Gill Gillivray Innes Iver Kinlay Lennan Master Murdo Nab Nair Naughton Nicol Phail Queen Quarrie Rae Ritchie Sween Taggart Tavish Whirter',
        places: {
            words: { river: 'abhainn', hill: 'cnoc', mountain: 'beinn', valley: 'gleann', lake: 'loch', sea: 'muir', wood: 'coille', field: 'achadh', stone: 'clach', ford: 'àth', island: 'eilean', marsh: 'blàr', fort: 'dùn', church: 'cille', head: 'ceann', black: 'dubh', white: 'bàn', red: 'ruadh', green: 'glas', old: 'sean', high: 'àrd', holy: 'naomh', wolf: 'madadh', eagle: 'iolair', deer: 'fiadh', yellow: 'buidhe', big: 'mòr', little: 'beag' },
            starts: [['kil', 'church of'], ['dun', 'fort of'], ['inver', 'river mouth'], ['ard', 'height of'], ['strath', 'broad valley of'], ['glen', 'glen of'], ['bal', 'farm of'], ['auch', 'field of'], ['ben', 'peak of'], ['loch', 'loch of'], ['kin', 'head of'], ['tor', 'hill of']],
            endings: [['more', 'great'], ['beg', 'little'], ['dubh', 'black'], ['ruadh', 'red'], ['an', 'little'], ['ach', 'place of']],
        },
    },
    {
        id: 'irish', label: 'Irish', detect: ['ireland', 'irish', 'dublin', 'galway', 'cork', 'connacht', 'munster', 'ulster', 'leinster'],
        era: 'medieval', convention: 'western', adjective: ['ach'],
        given: {
            m: 'Brian Conchobar Domnall Niall Áed Cathal Diarmait Donnchad Fergal Ruaidrí Tadhg Toirdelbach Muirchertach Lorcán Flann Fiachra Eógan Conall Cormac Colm Cian Ciarán Enda Fionn Oisín Cú_Chulainn Lugh Bran Ailill Fergus Lóegaire Murchad Mael_Sechnaill Senán Brendan Declan Kevin Ronan Rory Seán Pádraig Eamon Fintan Odhrán Mochta Faolán Oscar Cathaoir',
            f: 'Gormlaith Derbforgaill Órlaith Muirenn Gráinne Deirdre Étaín Fionnuala Aoife Medb Niamh Sadhbh Clíodhna Emer Áine Brigid Caoimhe Siobhán Róisín Saoirse Méabh Aisling Orla Una Fiadh Ciara Nuala Sorcha Eithne Muireann Bébinn Lasairfhíona Mór Sláine Cáit Eibhlín Nóra Máire Síle Treasa Ailbhe Éabha Blathnaid Dearbhla Grainne Ríona Fainche Muadhnait',
        },
        prefixes: [['Ó', 55], ['Mac', 45]], femalePrefixes: { Ó: 'Ní', Mac: 'Nic' }, realPrefixes: true,
        family: 'Néill Briain Conchobhair Domhnaill Ceallaigh Súilleabháin Cearbhaill Ruairc Dubhghaill Mathúna Raghallaigh Flaithbheartaigh Floinn Murchadha Dálaigh Donnchadha Cathasaigh Laoghaire Riain Gormáin Eadhra Madagáin Cinnéide Bhriain Mhurchú Gearailt Carthaigh Diarmada Aodha Coilín Fhlannchadha Giolla Phádraig Cába Duinnshléibhe',
        places: {
            words: { river: 'abhainn', hill: 'cnoc', mountain: 'sliabh', valley: 'gleann', lake: 'loch', sea: 'muir', wood: 'coill', field: 'gort', stone: 'cloch', ford: 'áth', island: 'inis', marsh: 'currach', fort: 'dún', church: 'cill', black: 'dubh', white: 'bán', red: 'rua', green: 'glas', old: 'sean', high: 'ard', holy: 'naofa', wolf: 'mac tíre', oak: 'doire', little: 'beag', big: 'mór', yew: 'iúr' },
            starts: [['kil', 'church of'], ['bally', 'town of'], ['dun', 'fort of'], ['ath', 'ford of'], ['clon', 'meadow of'], ['derry', 'oak grove of'], ['drum', 'ridge of'], ['ennis', 'island of'], ['knock', 'hill of'], ['rath', 'ringfort of'], ['slieve', 'mountain of'], ['carrick', 'rock of']],
            endings: [['more', 'great'], ['beg', 'little'], ['een', 'little'], ['agh', 'field'], ['ane', 'place of']],
        },
    },
    {
        id: 'breton', label: 'Breton', detect: ['brittany', 'breton', 'armorica'],
        era: 'medieval', convention: 'western', adjective: ['ad', 'iz'],
        given: {
            m: 'Alan Erwan Yann Gwenael Tanguy Riwal Hoel Konan Judikael Salaün Nominoe Erispoe Gradlon Gwenole Tudal Maodez Malo Brieg Ewen Gireg Kaourintin Loeiz Mikael Paol Per Ronan Tual Yannick Yves Gwilherm Herve Iwan Kadeg Morvan Padrig Tugdual Gurvan Gaël Goulven Arzhel Bleiz Derrien Envel Gweltaz Lomig Mael Neven',
            f: 'Anna Azenor Gwenn Katell Maiwenn Nolwenn Rozenn Soazig Tifenn Youenna Aela Aourell Bleuenn Brigitte Gwenaelle Enora Ivona Klervi Morgane Nolwen Rivanon Soizic Typhaine Gwenola Annaig Awen Dahud Enori Gwennoline Jaouen Kristell Lenaig Maela Morgana Oanez Riwanon Sterenn Tiphaine Youna',
        },
        family: 'Le_Gall Le_Goff Le_Bihan Le_Roux Le_Guen Le_Floch Le_Corre Le_Bras Le_Moal Le_Gac Le_Meur Guillou Tanguy Kerbrat Kervella Le_Borgne Le_Cam Le_Coz Le_Du Le_Fur Le_Hir Le_Lay Le_Men Morvan Quéré Riou Salaün Le_Saux Abgrall Bescond Cadiou Caradec Derrien Ferec Gourvennec Jaouen Kerjean Laouenan Madec Nedelec Prigent Quillec Rolland Thomas Urvoy',
        places: {
            words: { river: 'stêr', hill: 'menez', valley: 'traonienn', lake: 'lenn', sea: 'mor', wood: 'koad', field: 'park', stone: 'maen', island: 'enez', marsh: 'geun', church: 'lann', fort: 'kastell', black: 'du', white: 'gwenn', red: 'ruz', old: 'kozh', new: 'nevez', high: 'uhel', holy: 'sant', wolf: 'bleiz', oak: 'derv', house: 'ker' },
            starts: [['ker', 'village of'], ['plou', 'parish of'], ['lan', 'hermitage of'], ['tré', 'farm of'], ['loc', 'holy place of'], ['pen', 'head of'], ['kastell', 'castle of']],
            endings: [['ec', 'place of'], ['ou', 'the'], ['ven', 'white'], ['koad', 'wood']],
        },
    },
    {
        id: 'old_english', label: 'Old English', detect: ['anglo-saxon', 'saxon', 'saxons', 'mercia', 'wessex', 'northumbria'],
        era: 'medieval', convention: 'patronym', patronym: { m: '{given} {father}ing', f: '{given}, daughter of {father}' }, adjective: ['ish', 'ing'],
        given: {
            m: 'Ælfred Æthelred Æthelstan Eadweard Eadmund Eadgar Ecgberht Æthelwulf Offa Penda Oswald Oswiu Edwin Cuthbert Beornwulf Wulfstan Godwin Harold Leofric Byrhtnoth Wiglaf Beowulf Hrothgar Eadric Ælfric Wulfric Sigeberht Cynewulf Ceolwulf Ine Cædwalla Cerdic Cynric Ceawlin Æthelbald Ælfwine Leofwine Osric Wilfrid Aldhelm Bede Dunstan Odo Brihtric Ordgar Wulfnoth Tostig Gyrth Morcar Eadwine Siward',
            f: 'Æthelflæd Ælfgifu Eadgyth Æthelthryth Hild Cyneburh Eadburh Wynflæd Ealhswith Godgifu Leofrun Ælfthryth Æthelburh Cwenthryth Eormengyth Frithuswith Mildthryth Sexburh Wulfrun Ælfflæd Æthelgifu Eadgifu Ealdgyth Gytha Wulfhild Eanflæd Cynethryth Osthryth Werburh Edith Ælfwynn Beorhtgifu Leofgifu Sæthryth Tova Wulfwyn Brihtgifu Ecgwynn Godwyn Eadwynn Hereswith Burgred',
        },
        bynames: 'the Unready the Elder the Confessor the Peaceable Ironside Harefoot the Bold the Tall the Fair the Black the Red the Old the Young the Wise the Proud the Lame the Hunter the Smith the Reeve the Thane',
        places: {
            words: { river: 'burna', hill: 'dun', mountain: 'beorg', valley: 'denu', lake: 'mere', sea: 'sæ', wood: 'wudu', field: 'feld', stone: 'stan', ford: 'ford', bridge: 'brycg', island: 'ieg', marsh: 'mersc', spring: 'wella', fort: 'burh', farm: 'tun', clearing: 'leah', black: 'blæc', white: 'hwit', red: 'read', green: 'grene', old: 'eald', new: 'niwe', high: 'heah', holy: 'halig', iron: 'isern', wolf: 'wulf', oak: 'ac', ash: 'æsc', thorn: 'þorn', king: 'cyning' },
            endings: [['ton', 'farmstead'], ['ham', 'homestead'], ['ley', 'clearing'], ['bury', 'fort'], ['ford', 'ford'], ['wick', 'dairy farm'], ['stead', 'place'], ['field', 'open land'], ['worth', 'enclosure'], ['den', 'valley'], ['mere', 'lake'], ['well', 'spring'], ['stow', 'holy place'], ['cote', 'cottage'], ['hurst', 'wooded hill'], ['combe', 'deep valley']],
        },
    },
    {
        id: 'english', label: 'English', detect: ['england', 'english', 'london', 'britain', 'british', 'yorkshire', 'manchester', 'oxford', 'cambridge'],
        era: 'modern', convention: 'western', adjective: ['ish', 'er'],
        given: {
            m: 'David John Michael Paul Andrew Peter James Robert Mark Richard Stephen Christopher Ian Simon Thomas Daniel Matthew Gary Steven William Jonathan Martin Anthony Kevin Neil Jason Lee Darren Craig Adam Oliver Harry George Jack Noah Charlie Jacob Alfie Freddie Oscar Leo Arthur Henry Archie Theo Joshua Samuel Joseph Edward Benjamin Alexander Luke Ryan Liam Connor Callum Tom Ben Sam Joe',
            f: 'Sarah Claire Emma Nicola Lisa Helen Rachel Karen Julie Joanne Susan Michelle Louise Amanda Elizabeth Laura Rebecca Hannah Jessica Charlotte Sophie Amy Lucy Emily Katie Olivia Amelia Isla Ava Mia Ivy Lily Isabella Rosie Sophia Grace Freya Florence Willow Evie Poppy Ella Daisy Phoebe Alice Matilda Harriet Georgia Megan Chloe Abigail Holly Jade Gemma Kelly Kerry',
        },
        family: 'Smith Jones Taylor Brown Williams Wilson Johnson Davies Robinson Wright Thompson Evans Walker White Roberts Green Hall Wood Jackson Clarke Harris Thomas Lewis Turner Hill Martin Cooper Ward Morris Moore Clark Baker Harrison King Morgan Allen James Scott Phillips Watson Davis Parker Bennett Price Griffiths Young Mitchell Kelly Cook Carter Richardson Bailey Collins Bell Shaw Murphy Miller Cox Richards Marshall Anderson Simpson Ellis Adams Wilkinson Foster Chapman Powell Webb Rogers Gray Mason Hunt Campbell Matthews Owen Palmer Holmes Mills Barnes Knight Lloyd Butler Russell Barker Fisher Stevens Jenkins Murray Dixon Harvey Graham Pearson Fletcher Walsh Gibson Howard Andrews Stewart Elliott Reynolds Saunders Payne Fox Ford Pearce Day Brooks West Lawrence Cole Atkinson Bradley Spencer Gill Dawson Ball Burton O\x27Brien Watts Rose Booth Perry Ryan Grant Wells Armstrong Francis Rees Hayes Hart Hudson Newman Barrett Webster Hunter Gregory Carr Lowe Page Marsh Riley Dunn Woods Parsons Berry Stone Reid Holland Hawkins Harding Porter Robertson Newton Oliver Reed Kennedy Williamson Bird Gardner Dean Lane Cooke Bates Henderson Parry Burgess Bishop Walton Burns Nicholson Shepherd Ross Cross Long Freeman Warren Nicholls Hamilton Byrne Sutton McDonald Yates Hodgson Robson Curtis Hopkins O\x27Connor Harper Coleman Watkins Moss McCarthy Chambers Griffin Sharp Hardy Wheeler Potter Osborne Johnston Gordon Doyle Wallace George Jordan Hutchinson Rowe Burke May Pritchard Gilbert Willis Higgins Read Miles Stevenson Stephenson Hammond Arnold Buckley Walters Hewitt Barber Nelson Slater Austin Sullivan Whitehead Mann Frost Lambert Stephens Blake Lynch Goodwin Barton Woodward Thomson Cunningham Quinn Barnett Baxter Clayton Nash Greenwood Jennings Holt Kemp Poole Gallagher Bond Stokes Tucker Davidson Fowler Heath Norman Middleton Lee Banks French Goddard',
        eras: {
            medieval: {
                given: {
                    m: 'William John Richard Robert Thomas Walter Hugh Henry Roger Ralph Geoffrey Simon Nicholas Adam Gilbert Peter Stephen Reginald Alan Philip Ranulf Baldwin Hamo Odo Osbert Payn Warin Fulk Herbert Bartholomew Elias Godfrey Humphrey Jordan Lambert Martin Matthew Miles Nigel Osmund Randolph Robin Sampson Serlo Theobald Wymond Alexander Benedict Everard Gervase',
                    f: 'Alice Matilda Agnes Joan Emma Isabel Margery Juliana Cecily Avice Beatrice Edith Eleanor Margaret Maud Rose Sibyl Amice Christina Denise Ellen Emmeline Felicia Hawise Idonea Isolde Joanna Katherine Lettice Mabel Muriel Petronilla Philippa Rohesia Sabina Thomasina Annora Basilia Clemence Dionisia Eustacia Galiena Hodierna Ida Lucy Millicent Parnel',
                },
                family: 'atte_Wode atte_Brook atte_Hill atte_Well de_Lacy de_Clare de_Warenne de_Ferrers Fitzwilliam Fitzroy Fitzalan Carpenter Smith Miller Cooper Fletcher Tanner Webster Baker Fuller Turner Mason Thatcher Chandler Barker Brewer Butcher Cook Dyer Fisher Fowler Glover Hayward Hunter Marshall Parker Porter Reeve Sawyer Shepherd Spencer Tailor Walker Wainwright Ward Woodward Bacon Bigod Bohun Mortimer Neville Percy Lovell Mowbray Courtenay Grey Stafford',
            },
            victorian: {
                given: {
                    m: 'William John George Thomas James Henry Charles Joseph Robert Edward Frederick Albert Arthur Alfred Walter Samuel Richard Harry Ernest Francis Herbert David Frank Benjamin Edwin Daniel Isaac Peter Matthew Jonathan Josiah Septimus Horace Percy Cecil Reginald Montague Bertram Lionel Ambrose Erasmus Ebenezer Silas Jabez Obadiah Augustus Cornelius Leopold Rupert Wilfred Archibald Clarence',
                    f: 'Mary Elizabeth Sarah Ann Jane Emma Eliza Ellen Alice Annie Margaret Emily Martha Hannah Harriet Charlotte Louisa Florence Clara Fanny Edith Ada Caroline Catherine Maria Susan Rose Lucy Agnes Amelia Beatrice Constance Dorothea Eleanor Evangeline Georgiana Henrietta Isabella Lavinia Lydia Mabel Matilda Philippa Rosamund Theodora Violet Winifred Ethel Maud',
                },
            },
        },
        places: {
            words: { river: 'burn', hill: 'down', mountain: 'fell', valley: 'dale', lake: 'mere', sea: 'sea', wood: 'wood', field: 'field', stone: 'stone', ford: 'ford', bridge: 'bridge', island: 'ey', marsh: 'marsh', spring: 'well', fort: 'bury', farm: 'ton', black: 'black', white: 'whit', red: 'red', green: 'green', old: 'old', new: 'new', high: 'high', holy: 'holy', iron: 'iron', wolf: 'wolf', oak: 'oak', ash: 'ash', thorn: 'thorn', king: 'kings', church: 'kirk', bishop: 'bishops' },
            endings: [['ton', 'farmstead'], ['ham', 'homestead'], ['ley', 'clearing'], ['bury', 'fort'], ['ford', 'ford'], ['wick', 'dairy farm'], ['field', 'open land'], ['worth', 'enclosure'], ['by', 'village'], ['thorpe', 'hamlet'], ['dale', 'valley'], ['well', 'spring'], ['stow', 'holy place'], ['hurst', 'wooded hill'], ['combe', 'deep valley'], ['minster', 'great church'], ['chester', 'old fort'], ['mouth', 'river mouth'], ['bridge', 'bridge'], ['gate', 'way']],
        },
        streets: ['{word} Street', '{word} Road', '{word} Lane', '{word} Close', '{word} Row', '{word} Terrace', '{family} Street', '{family} Road', 'Church Lane', 'Mill Lane', 'High Street', 'Station Road'],
        businesses: ['The {adj} {noun}', '{family} & Sons', "{family}'s", '{family} and {family}', '{town} {trade}', 'The {noun} and {noun}'],
    },
    {
        id: 'american', label: 'American', detect: ['america', 'american', 'usa', 'united states', 'new york', 'chicago', 'texas', 'california', 'boston', 'los angeles', 'arkham', 'new orleans'],
        era: 'modern', convention: 'western', adjective: ['an', 'er'],
        given: {
            m: 'James Michael Robert John David William Richard Joseph Thomas Christopher Charles Daniel Matthew Anthony Mark Donald Steven Andrew Paul Joshua Kenneth Kevin Brian George Timothy Ronald Jason Edward Jeffrey Ryan Jacob Gary Nicholas Eric Jonathan Stephen Larry Justin Scott Brandon Benjamin Samuel Gregory Alexander Patrick Frank Raymond Jack Dennis Jerry Tyler Aaron Jose Adam Nathan Henry Zachary Douglas Peter Kyle Noah Ethan Jeremy Walter Christian Keith Roger Terry Austin Sean Gerald Carl Harold Dylan Arthur Lawrence Jordan Jesse Bryan Billy Bruce Gabriel Joe Logan Alan Juan Albert Willie Elijah Wayne Randy Vincent Mason Roy Ralph Bobby Russell Bradley Philip Eugene Liam Lucas Elias Owen Caleb Hunter Wyatt Colton Jaxon',
            f: 'Mary Patricia Jennifer Linda Elizabeth Barbara Susan Jessica Karen Sarah Lisa Nancy Sandra Betty Ashley Emily Kimberly Margaret Donna Michelle Carol Amanda Melissa Deborah Stephanie Rebecca Sharon Laura Cynthia Dorothy Amy Kathleen Angela Shirley Emma Brenda Pamela Nicole Anna Samantha Katherine Christine Debra Rachel Carolyn Janet Maria Olivia Heather Helen Catherine Diane Julie Victoria Joyce Lauren Kelly Christina Ruth Joan Virginia Judith Evelyn Hannah Andrea Megan Cheryl Jacqueline Madison Teresa Abigail Sophia Martha Sara Gloria Janice Kathryn Ann Isabella Judy Charlotte Julia Grace Amber Alice Jean Denise Frances Danielle Marilyn Natalie Beverly Diana Brittany Theresa Kayla Alexis Doris Lori Tiffany Ava Mia Harper Ella Avery Scarlett Aria Chloe Zoey Riley Layla Brooklyn Savannah Paisley',
        },
        family: 'Smith Johnson Williams Brown Jones Garcia Miller Davis Rodriguez Martinez Hernandez Lopez Gonzalez Wilson Anderson Thomas Taylor Moore Jackson Martin Lee Perez Thompson White Harris Sanchez Clark Ramirez Lewis Robinson Walker Young Allen King Wright Scott Torres Hill Flores Green Adams Nelson Baker Hall Rivera Campbell Mitchell Carter Roberts Gomez Phillips Evans Turner Diaz Parker Cruz Edwards Collins Reyes Stewart Morris Morales Murphy Cook Rogers Gutierrez Ortiz Morgan Cooper Peterson Bailey Reed Kelly Howard Ramos Cox Ward Richardson Watson Brooks Chavez Wood James Bennett Gray Mendoza Ruiz Hughes Price Alvarez Castillo Sanders Myers Long Ross Foster Jimenez Powell Jenkins Perry Russell Sullivan Bell Coleman Butler Henderson Barnes Gonzales Fisher Vasquez Simmons Romero Jordan Patterson Alexander Hamilton Graham Reynolds Griffin Wallace Moreno West Cole Hayes Bryant Herrera Gibson Ellis Medina Aguilar Stevens Murray Ford Castro Marshall Owens Harrison Fernandez McDonald Woods Washington Kennedy Wells Vargas Henry Freeman Webb Tucker Guzman Burns Crawford Olson Simpson Porter Hunter Gordon Mendez Silva Shaw Snyder Mason Dixon Munoz Hunt Hicks Holmes Palmer Wagner Black Robertson Boyd Rose Stone Salazar Fox Warren Mills Meyer Rice Schmidt Garza Daniels Ferguson Nichols Stephens Soto Weaver Ryan Gardner Payne Grant Dunn Kelley Spencer Hawkins Arnold Pierce Vazquez Hansen Peters Santos Hart Bradley Knight Elliott Cunningham Duncan Armstrong Hudson Carroll Lane Riley Andrews Alvarado Ray Delgado Berry Perkins Hoffman Johnston Matthews Pena Richards Contreras Willis Carpenter Lawrence Sandoval',
        eras: {
            '1920s': {
                given: {
                    m: 'John William James Robert Joseph George Charles Edward Frank Thomas Walter Harold Henry Paul Richard Raymond Albert Arthur Harry Donald Ralph Louis Jack Clarence Carl Willie Howard Fred David Kenneth Francis Roy Earl Joe Ernest Lawrence Stanley Anthony Eugene Samuel Alfred Herbert Elmer Melvin Leonard Norman Bernard Floyd Leroy Lester Chester Clyde Herman Lloyd Wilbur Vernon Homer Otis Virgil Rufus Amos Ambrose Ezra Thaddeus Silas',
                    f: 'Mary Dorothy Helen Margaret Ruth Virginia Elizabeth Frances Mildred Evelyn Anna Alice Marie Lillian Rose Irene Louise Florence Josephine Catherine Edna Gladys Ethel Grace Thelma Martha Lucille Edith Clara Hazel Doris Gertrude Bernice Pauline Ruby Vera Agnes Esther Beatrice Viola Ida Mabel Myrtle Opal Pearl Velma Minnie Bessie Hattie Lula Della Inez Effie Ola Zelda Winifred Harriet Eunice Wilhelmina',
                },
            },
        },
        places: {
            words: { river: 'river', hill: 'hill', mountain: 'mount', valley: 'valley', lake: 'lake', wood: 'wood', field: 'field', stone: 'stone', ford: 'ford', bridge: 'bridge', spring: 'springs', black: 'black', white: 'white', red: 'red', green: 'green', old: 'old', new: 'new', high: 'high', iron: 'iron', wolf: 'wolf', oak: 'oak', elm: 'elm', pine: 'pine', cedar: 'cedar', eagle: 'eagle', buffalo: 'buffalo', bear: 'bear', crow: 'crow', silver: 'silver', gold: 'gold', rock: 'rock' },
            endings: [['ville', 'town'], ['ton', 'town'], [' Falls', 'falls'], [' Springs', 'springs'], [' Creek', 'creek'], [' City', 'city'], ['burg', 'town'], [' Junction', 'junction'], [' Hollow', 'hollow'], [' Ridge', 'ridge'], [' Crossing', 'crossing'], ['field', 'field'], ['wood', 'wood'], ['dale', 'valley'], [' Gulch', 'gulch'], [' Bend', 'bend']],
        },
        streets: ['{word} Street', '{word} Avenue', '{word} Road', '{word} Drive', '{word} Boulevard', '{family} Street', '{family} Avenue', 'Main Street', 'Elm Street', 'Maple Avenue', 'Oak Street', 'Second Street', 'Third Avenue', 'Washington Street', 'Lincoln Avenue', 'Park Avenue', 'Lake Street', 'Hill Street'],
        businesses: ["{family}'s", "{given}'s {trade}", '{family} & Sons', '{town} {trade}', '{family} Brothers', 'The {adj} {noun}', '{word} {trade}'],
    },
    {
        id: 'german', label: 'German', detect: ['germany', 'german', 'berlin', 'munich', 'hamburg', 'bavaria', 'prussia', 'vienna', 'austria'],
        era: 'modern', convention: 'western', adjective: ['er', 'isch'],
        given: {
            m: 'Peter Michael Thomas Andreas Wolfgang Klaus Jürgen Stefan Christian Uwe Werner Frank Hans Bernd Martin Helmut Matthias Dieter Gerhard Jörg Manfred Markus Günter Horst Sven Jens Dirk Ralf Karl Heinz Lukas Leon Finn Jonas Paul Ben Elias Felix Maximilian Noah Luis Emil Anton Henry Theo Jakob Moritz Florian Tobias Sebastian Johannes Friedrich Konrad Ludwig Otto Wilhelm Hermann Ernst Gottfried Heinrich Albrecht Ulrich',
            f: 'Ursula Monika Petra Elisabeth Sabine Renate Helga Karin Brigitte Ingrid Erika Andrea Gisela Claudia Susanne Gabriele Christa Christine Hildegard Anna Marie Sophie Emma Mia Hannah Lena Lea Leonie Lina Johanna Clara Charlotte Greta Frieda Ida Mathilda Luise Paula Emilia Amelie Katharina Julia Laura Sarah Lisa Anja Birgit Heike Silke Ute Annegret Gertrud Liselotte Wilhelmine Adelheid Friederike Margarete',
        },
        family: 'Müller Schmidt Schneider Fischer Weber Meyer Wagner Becker Schulz Hoffmann Schäfer Koch Bauer Richter Klein Wolf Schröder Neumann Schwarz Zimmermann Braun Krüger Hofmann Hartmann Lange Schmitt Werner Schmitz Krause Meier Lehmann Schmid Schulze Maier Köhler Herrmann König Walter Mayer Huber Kaiser Fuchs Peters Lang Scholz Möller Weiß Jung Hahn Schubert Vogel Friedrich Keller Günther Frank Berger Winkler Roth Beck Lorenz Baumann Franke Albrecht Schuster Simon Ludwig Böhm Winter Kraus Martin Schumacher Krämer Vogt Stein Jäger Otto Sommer Groß Seidel Heinrich Brandt Haas Schreiber Graf Schulte Dietrich Ziegler Kuhn Kühn Pohl Engel Horn Busch Bergmann Thomas Voigt Sauer Arnold Wolff Pfeiffer',
        prefixes: [['von', 4], ['zu', 1]],
        oldFamily: 'Hohenstein Falkenberg Rabenau Eschenbach Wolfsburg Lichtenau Rosenthal Eisenberg Greifenstein Schwarzenberg Waldeck Lindenau Ravensburg Drachenfels Hirschberg Adlerhorst Bärenfels Steinach Kronberg Löwenstein Ortenburg Rotenhan Wittelsbach Hohenlohe Isenburg Katzenelnbogen Leiningen Nassau Sayn Solms Truchsess Waldburg Zollern Stauffen Wildenfels Grünberg Weißenfels Blankenburg Querfurt',
        places: {
            words: { river: 'bach', hill: 'bühl', mountain: 'berg', valley: 'tal', lake: 'see', sea: 'meer', wood: 'wald', field: 'feld', stone: 'stein', ford: 'furt', bridge: 'brück', island: 'au', marsh: 'moor', spring: 'brunn', fort: 'burg', black: 'schwarz', white: 'weiß', red: 'rot', green: 'grün', old: 'alt', new: 'neu', high: 'hoch', holy: 'heilig', iron: 'eisen', wolf: 'wolf', oak: 'eich', linden: 'linden', raven: 'raben', eagle: 'adler', falcon: 'falken', rose: 'rosen', salt: 'salz', gold: 'gold' },
            endings: [['burg', 'castle'], ['berg', 'mountain'], ['dorf', 'village'], ['hausen', 'houses'], ['heim', 'home'], ['stadt', 'town'], ['feld', 'field'], ['bach', 'brook'], ['furt', 'ford'], ['tal', 'valley'], ['ingen', "people's place"], ['rode', 'clearing'], ['stein', 'rock'], ['wald', 'forest'], ['au', 'meadow'], ['brück', 'bridge']],
        },
    },
    {
        id: 'dutch', label: 'Dutch', detect: ['netherlands', 'dutch', 'holland', 'amsterdam', 'rotterdam', 'flanders', 'flemish', 'antwerp', 'bruges', 'ghent'],
        era: 'modern', convention: 'western', adjective: ['s', 'er'],
        given: {
            m: 'Jan Johannes Pieter Cornelis Hendrik Willem Gerrit Jacobus Adrianus Dirk Joost Maarten Joren Bram Daan Sem Lucas Milan Levi Luuk Thijs Jesse Ruben Stijn Bas Sander Wouter Koen Thomas Tim Niels Jeroen Arjen Floris Gijs Hugo Jasper Lars Mees Olivier Pim Rutger Siem Teun Vincent Wessel Reinier Frans Klaas Kees Joris Lodewijk Roelof Sjoerd Tjeerd Wim Huib Govert Barend',
            f: 'Maria Johanna Cornelia Anna Wilhelmina Elisabeth Hendrika Catharina Geertruida Adriana Anke Annemieke Marloes Femke Fleur Sanne Lotte Lieke Iris Eva Noor Julia Sophie Emma Tess Zoë Sara Lisa Anouk Esmee Floor Ilse Jet Marit Nina Roos Saar Silke Vera Yara Fenna Lieve Mila Nienke Wietske Hester Geesje Trijntje Aaltje Grietje Marijke Femmigje Liesbeth',
        },
        prefixes: [['van', 22], ['de', 18], ['van der', 8], ['van den', 5], ['van de', 5], ['ter', 2], ['ten', 1], ['op den', 1]],
        family: 'de_Jong Jansen de_Vries van_den_Berg van_Dijk Bakker Janssen Visser Smit Meijer de_Boer Mulder de_Groot Bos Vos Peters Hendriks van_Leeuwen Dekker Brouwer de_Wit Dijkstra Smits de_Graaf van_der_Meer van_der_Linden Kok Jacobs de_Haan Vermeulen van_den_Heuvel van_der_Veen van_den_Broek de_Bruijn de_Bruin van_der_Heijden Schouten van_Beek Willems van_Vliet van_de_Ven Hoekstra Maas Verhoeven Koster van_Dam van_der_Wal Prins Blom Huisman Peeters de_Lange Kuipers van_Wijk Postma Kramer van_den_Bosch Molenaar Vermeer van_Dalen van_Rijn Hooft Wouters Bosman Brink Timmermans Stam Gerritsen Martens Verbeek ter_Horst ten_Brink van_Gogh de_Ruyter Tromp de_Witt',
        oldFamily: 'Dalen Rijn Hooft Delft Doorn Aelst Bree Haarlem Leyden Brederode Egmond Arkel Wassenaer Heemskerck Duivenvoorde Polanen Matenesse Borssele Cuyk Horne Wesel Asperen Lynden Heeckeren Isendoorn Hekeren Rechteren Twickelo Bentinck Voorst Ripperda Lewe Ewsum Unico Burmania Harinxma Sjaerda',
        places: {
            words: { river: 'aa', hill: 'heuvel', mountain: 'berg', valley: 'dal', lake: 'meer', sea: 'zee', wood: 'bos', field: 'veld', stone: 'steen', ford: 'voorde', bridge: 'brug', island: 'oog', marsh: 'veen', spring: 'bron', dike: 'dijk', dam: 'dam', black: 'zwart', white: 'wit', red: 'rood', green: 'groen', old: 'oud', new: 'nieuw', high: 'hoog', holy: 'heilig', iron: 'ijzer', wolf: 'wolf', oak: 'eik', mill: 'molen', sand: 'zand', salt: 'zout' },
            endings: [['dam', 'dam'], ['dijk', 'dike'], ['wijk', 'quarter'], ['veen', 'peat bog'], ['hoven', 'farms'], ['dorp', 'village'], ['huizen', 'houses'], ['broek', 'marsh'], ['horst', 'thicket'], ['zande', 'sands'], ['kerk', 'church'], ['haven', 'harbour'], ['rade', 'clearing'], ['loo', 'wood'], ['drecht', 'ford'], ['sloot', 'ditch']],
        },
    },
    {
        id: 'french', label: 'French', detect: ['france', 'french', 'paris', 'marseille', 'lyon', 'bordeaux', 'normandy', 'provence'],
        era: 'modern', convention: 'western', adjective: ['ois', 'ais', 'ien'],
        given: {
            m: 'Jean Pierre Michel André Philippe René Louis Alain Jacques Bernard Marcel Daniel Roger Robert Paul Claude Christian Henri Georges Nicolas François Patrick Gérard Christophe Joseph Thierry Julien Sébastien Antoine Gabriel Léo Raphaël Arthur Louis Jules Hugo Maël Lucas Adam Nathan Théo Victor Baptiste Clément Mathis Guillaume Étienne Mathieu Benoît Olivier Lucien Gaston Armand Aurélien Bastien Florian Rémi Yves',
            f: 'Marie Jeanne Françoise Monique Catherine Nathalie Isabelle Jacqueline Anne Sylvie Martine Madeleine Nicole Suzanne Hélène Christine Marguerite Denise Louise Christiane Valérie Sophie Sandrine Céline Aurélie Camille Léa Manon Chloé Emma Jade Louise Alice Lina Rose Anna Mila Ambre Léna Juliette Inès Zoé Margaux Pauline Élodie Amélie Colette Odette Simone Geneviève Héloïse Mathilde Agathe Clémence Solène Capucine',
        },
        prefixes: [['de', 4], ['du', 2], ['de la', 1], ['le', 3]],
        family: 'Martin Bernard Thomas Petit Robert Richard Durand Dubois Moreau Laurent Simon Michel Lefebvre Leroy Roux David Bertrand Morel Fournier Girard Bonnet Dupont Lambert Fontaine Rousseau Vincent Lefèvre Faure André Mercier Blanc Guérin Boyer Garnier Chevalier François Legrand Gauthier Perrin Robin Clément Morin Nicolas Henry Roussel Mathieu Gautier Masson Marchand Duval Denis Dumont Marie Lemaire Noël Dufour Meunier Brun Blanchard Giraud Joly Rivière Lucas Brunet Gaillard Barbier Arnaud Gérard Roche Renard Roy Leroux Colin Vidal Caron Picard Roger Fabre Aubert Lemoine Renaud Dumas Lacroix Olivier Philippe Bourgeois Pierre Benoît Rey Leclerc Rolland Leclercq Guillaume Lecomte Jean Dupuy Guillot Hubert Berger Carpentier Dupuis Moulin Louis Deschamps Huet Vasseur Boucher Fleury Royer Jacquet Adam Paris Poirier Marty Aubry Guyot Carré Charles Renault Charpentier Ménard Maillard Baron Bertin Bailly Hervé Le_Gall Collet Léger Bouvier Julien Prévost Millet Perrot Daniel Le_Roux Cousin Germain Breton Besson Langlois Rémy Le_Goff Pelletier Lévêque Perrier Leblanc Barré Lebrun Marchal Mallet Hamon Boulanger Jacob Monnier Michaud Guichard Gillet Étienne Poulain Tessier Chevallier Collin Chauvin Da_Silva Bouchet Gay Lemaître Bénard Maréchal Humbert Reynaud Antoine Perret Barthélemy Cordier Pichon Lejeune Gilbert Lamy Delaunay Pasquier Carlier Laporte',
        oldFamily: 'Montfort Lusignan Coucy Montmorency Polignac Rohan Valois Bourbon Anjou Foix Armagnac Albret Chatillon Clermont Joinville Brienne Beaumont Courtenay Dreux Harcourt Laval Montaigu Narbonne Roucy Sancerre Tancarville Vendôme Villehardouin Turenne Rochechouart Crussol Noailles Lévis Grimaldi Rochefort Beauvau Chabot Créquy Gramont Rieux',
        places: {
            words: { river: 'rivière', hill: 'mont', mountain: 'mont', valley: 'val', lake: 'lac', sea: 'mer', wood: 'bois', field: 'champ', stone: 'pierre', ford: 'gué', bridge: 'pont', island: 'île', marsh: 'marais', spring: 'fontaine', fort: 'château', black: 'noir', white: 'blanc', red: 'rouge', green: 'vert', old: 'vieux', new: 'neuf', high: 'haut', holy: 'saint', iron: 'fer', wolf: 'loup', oak: 'chêne', rock: 'roche', beautiful: 'beau', clear: 'clair' },
            endings: [['ville', 'town'], ['court', 'farm'], ['mont', 'hill'], ['val', 'valley'], ['champ', 'field'], ['fort', 'stronghold'], ['bourg', 'town'], ['ac', 'estate'], ['ay', 'estate'], ['ieux', 'place'], ['y', 'estate'], ['lieu', 'place'], ['chastel', 'castle'], ['fontaine', 'spring'], ['roche', 'rock'], ['pont', 'bridge']],
        },
        streets: ['Rue {word}', 'Rue de la {word}', 'Rue du {word}', 'Avenue {family}', 'Boulevard {family}', 'Place {family}', 'Quai {word}', 'Impasse {word}'],
        businesses: ['Chez {given}', 'Café {word}', 'Le {noun} {adj}', 'Maison {family}', '{family} et Fils', 'Bistro {given}'],
    },
    {
        id: 'quebecois', label: 'Québécois', detect: ['quebec', 'québec', 'montreal', 'montréal', 'québécois', 'quebecois'],
        era: 'modern', convention: 'western', adjective: ['ois'],
        given: {
            m: 'Jean Pierre Michel Guy Claude André Marc Daniel Luc Martin Stéphane Sylvain Mario Alain Denis Jacques Yves François Éric Patrick Mathieu Simon Alexandre Gabriel Olivier Samuel William Félix Thomas Liam Noah Jacob Raphaël Charles Antoine Louis Émile Édouard Benjamin Zack Xavier Jérémie Maxime Vincent Sébastien Nicolas Philippe Étienne Hugo Gaétan Réjean Gilles Rosaire Normand',
            f: 'Marie Louise Lise Diane Sylvie Nathalie Julie Isabelle Chantal Johanne Manon Josée Line France Ginette Nicole Lucie Carole Mélanie Geneviève Catherine Émilie Audrey Marie-Ève Marie-Pier Stéphanie Valérie Véronique Annie Karine Caroline Léa Emma Florence Alice Charlotte Rosalie Juliette Zoé Béatrice Livia Maëlie Laurence Sarah-Maude Gabrielle Jeanne Clara Élodie Thérèse Yvette Rita Huguette Pierrette Rolande',
        },
        family: 'Tremblay Gagnon Roy Côté Bouchard Gauthier Morin Lavoie Fortin Gagné Ouellet Pelletier Bélanger Lévesque Bergeron Leblanc Paquette Girard Simard Boucher Caron Beaulieu Cloutier Dubé Poirier Fournier Lapointe Leclerc Lefebvre Poulin Thibault St-Pierre Nadeau Martin Landry Martel Bédard Grenier Lessard Bernier Richard Michaud Hébert Desjardins Couture Turcotte Lachance Parent Blais Gosselin Savard Proulx Beaudoin Demers Perreault Boudreau Lemieux Cyr Perron Dufour Dion Mercier Bolduc Bérubé Boisvert Langlois Ménard Thériault Lacroix Plante Gélinas Paré Rioux Vachon Sauvé Lalonde Brassard Charbonneau Champagne Tessier Doucet Labelle Daigle',
        places: {
            words: { river: 'rivière', hill: 'côte', mountain: 'mont', lake: 'lac', wood: 'bois', field: 'champ', stone: 'pierre', island: 'île', spring: 'source', falls: 'chute', black: 'noir', white: 'blanc', red: 'rouge', green: 'vert', old: 'vieux', new: 'neuf', holy: 'saint', wolf: 'loup', bear: 'ours', beaver: 'castor', maple: 'érable', pine: 'pin', cedar: 'cèdre' },
            starts: [['Saint-', 'parish of'], ['Sainte-', 'parish of'], ['Lac-', 'lake of'], ['Notre-Dame-de-', 'Our Lady of'], ['Rivière-', 'river of'], ['Mont-', 'mount of']],
            endings: [['ville', 'town'], ['court', 'farm'], ['mont', 'hill'], [' des Bois', 'of the woods'], [' du Lac', 'of the lake']],
        },
    },
    {
        id: 'basque', label: 'Basque', detect: ['basque', 'euskadi', 'bilbao', 'navarre', 'pamplona'],
        era: 'modern', convention: 'spanish', adjective: ['ar', 'tar'],
        given: {
            m: 'Iñaki Jon Mikel Unai Ander Gorka Iker Asier Aitor Xabier Eneko Julen Oier Imanol Josu Koldo Peio Beñat Ibai Aritz Haritz Garikoitz Igor Ekaitz Urko Ion Andoni Joseba Kepa Patxi Txomin Iñigo Eñaut Markel Oihan Egoitz Gaizka Hodei Lander Mattin Ager Bittor Ekain Erlantz Gotzon Iurgi Jokin Luken Orats Xuban Zigor',
            f: 'Ane Maite Nerea Amaia Ainhoa Leire Itziar Irati Uxue Garazi Miren Edurne Arantxa Ainara June Nahia Haizea Oihana Izaro Saioa Maddi Libe Lorea Eider Olatz Alaitz Itsaso Naroa Ione Aitziber Begoña Itxaso Kattalin Garbiñe Idoia Josune Jaione Mirentxu Nekane Usue Zuriñe Malen Enara Haize Ianire Larraitz Ohiane Udane Ximena',
        },
        family: 'Agirre Etxeberria Garmendia Goikoetxea Ibarra Iriarte Larrañaga Mendizabal Olaizola Uriarte Zubizarreta Arrieta Aranburu Azkue Bengoetxea Elizondo Etxeverria Gorostiaga Ugarte Urrutia Zabala Zuloaga Aizpurua Altuna Amezaga Arana Arrizabalaga Barrenetxea Beitia Elkano Errazti Etxegarai Garai Goñi Iturbe Izagirre Jauregi Lasa Loiola Mujika Oiarzabal Olano Otegi Retegi Saizar Sarasola Txurruka Unzueta Zarate Zubiri Irigoien Lizarazu',
        places: {
            words: { river: 'ibai', hill: 'mendi', mountain: 'mendi', valley: 'haran', lake: 'aintzira', sea: 'itsaso', wood: 'baso', field: 'soro', stone: 'harri', bridge: 'zubi', island: 'uharte', spring: 'iturri', house: 'etxe', church: 'eliza', black: 'beltz', white: 'zuri', red: 'gorri', green: 'berde', old: 'zahar', new: 'berri', high: 'goi', holy: 'santu', iron: 'burdin', wolf: 'otso', oak: 'haritz', ash: 'lizar' },
            endings: [['ola', 'forge'], ['eta', 'place of many'], ['aga', 'place'], ['zu', 'abundance of'], ['egi', 'slope'], ['etxea', 'the house'], ['berri', 'new'], ['goien', 'upper'], ['barren', 'lower'], ['buru', 'end of'], ['arte', 'between']],
        },
    },
];
