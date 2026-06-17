const SurveyStore = (function() {
    const SURVEYS_KEY = 'survey_surveys';
    const RESPONSES_KEY = 'survey_responses';

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    function getSurveys() {
        const data = localStorage.getItem(SURVEYS_KEY);
        return data ? JSON.parse(data) : [];
    }

    function saveSurveys(surveys) {
        localStorage.setItem(SURVEYS_KEY, JSON.stringify(surveys));
    }

    function getSurvey(id) {
        const surveys = getSurveys();
        return surveys.find(s => s.id === id) || null;
    }

    function createSurvey(surveyData) {
        const surveys = getSurveys();
        const survey = {
            id: generateId(),
            title: surveyData.title || '未命名问卷',
            description: surveyData.description || '',
            questions: surveyData.questions || [],
            settings: {
                startTime: surveyData.settings?.startTime || null,
                endTime: surveyData.settings?.endTime || null,
                maxResponses: surveyData.settings?.maxResponses || 0,
                password: surveyData.settings?.password || '',
                allowModify: false
            },
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        surveys.push(survey);
        saveSurveys(surveys);
        return survey;
    }

    function updateSurvey(id, updates) {
        const surveys = getSurveys();
        const index = surveys.findIndex(s => s.id === id);
        if (index === -1) return null;
        surveys[index] = {
            ...surveys[index],
            ...updates,
            updatedAt: Date.now()
        };
        saveSurveys(surveys);
        return surveys[index];
    }

    function deleteSurvey(id) {
        const surveys = getSurveys().filter(s => s.id !== id);
        saveSurveys(surveys);
        const responses = getResponses().filter(r => r.surveyId !== id);
        saveResponses(responses);
    }

    function getResponses() {
        const data = localStorage.getItem(RESPONSES_KEY);
        return data ? JSON.parse(data) : [];
    }

    function saveResponses(responses) {
        localStorage.setItem(RESPONSES_KEY, JSON.stringify(responses));
    }

    function getSurveyResponses(surveyId) {
        return getResponses().filter(r => r.surveyId === surveyId);
    }

    function getResponseCount(surveyId) {
        return getSurveyResponses(surveyId).length;
    }

    function submitResponse(surveyId, answers, respondentInfo = {}) {
        const survey = getSurvey(surveyId);
        if (!survey) {
            return { success: false, error: '问卷不存在' };
        }

        const now = Date.now();
        if (survey.settings.startTime && now < new Date(survey.settings.startTime).getTime()) {
            return { success: false, error: '问卷尚未开始' };
        }
        if (survey.settings.endTime && now > new Date(survey.settings.endTime).getTime()) {
            return { success: false, error: '问卷已截止' };
        }
        if (survey.settings.maxResponses > 0) {
            const count = getResponseCount(surveyId);
            if (count >= survey.settings.maxResponses) {
                return { success: false, error: '答题人数已达上限' };
            }
        }

        const response = {
            id: generateId(),
            surveyId: surveyId,
            answers: answers,
            respondentInfo: respondentInfo,
            submittedAt: now
        };

        const responses = getResponses();
        responses.push(response);
        saveResponses(responses);

        return { success: true, responseId: response.id };
    }

    function getResponse(id) {
        const responses = getResponses();
        return responses.find(r => r.id === id) || null;
    }

    function calculateStats(surveyId) {
        const survey = getSurvey(surveyId);
        const responses = getSurveyResponses(surveyId);

        if (!survey) return null;

        const stats = {
            totalResponses: responses.length,
            questions: {}
        };

        survey.questions.forEach(question => {
            const qId = question.id;
            const qStats = {
                type: question.type,
                title: question.title,
                totalAnswered: 0
            };

            if (['single', 'multiple', 'dropdown'].includes(question.type)) {
                qStats.options = {};
                question.options.forEach(opt => {
                    qStats.options[opt] = 0;
                });

                responses.forEach(response => {
                    const answer = response.answers[qId];
                    if (answer !== undefined && answer !== null && answer !== '') {
                        qStats.totalAnswered++;
                        if (question.type === 'multiple') {
                            if (Array.isArray(answer)) {
                                answer.forEach(a => {
                                    if (qStats.options.hasOwnProperty(a)) {
                                        qStats.options[a]++;
                                    }
                                });
                            }
                        } else {
                            if (qStats.options.hasOwnProperty(answer)) {
                                qStats.options[answer]++;
                            }
                        }
                    }
                });

                qStats.percentages = {};
                Object.keys(qStats.options).forEach(opt => {
                    qStats.percentages[opt] = qStats.totalAnswered > 0
                        ? Math.round((qStats.options[opt] / qStats.totalAnswered) * 100)
                        : 0;
                });
            } else if (question.type === 'rating') {
                let sum = 0;
                let count = 0;
                responses.forEach(response => {
                    const answer = response.answers[qId];
                    if (answer && typeof answer === 'number') {
                        sum += answer;
                        count++;
                    }
                });
                qStats.totalAnswered = count;
                qStats.average = count > 0 ? (sum / count).toFixed(2) : 0;
                qStats.distribution = {};
                const maxRating = question.maxRating || 5;
                for (let i = 1; i <= maxRating; i++) {
                    qStats.distribution[i] = 0;
                }
                responses.forEach(response => {
                    const answer = response.answers[qId];
                    if (answer && qStats.distribution.hasOwnProperty(answer)) {
                        qStats.distribution[answer]++;
                    }
                });
            } else if (question.type === 'matrix') {
                qStats.rows = {};
                question.rows.forEach(row => {
                    qStats.rows[row] = {};
                    question.columns.forEach(col => {
                        qStats.rows[row][col] = 0;
                    });
                });
                responses.forEach(response => {
                    const answer = response.answers[qId];
                    if (answer && typeof answer === 'object') {
                        let answered = false;
                        Object.keys(answer).forEach(row => {
                            if (answer[row] && qStats.rows[row] && qStats.rows[row].hasOwnProperty(answer[row])) {
                                qStats.rows[row][answer[row]]++;
                                answered = true;
                            }
                        });
                        if (answered) qStats.totalAnswered++;
                    }
                });
            } else if (question.type === 'text') {
                qStats.answers = [];
                responses.forEach(response => {
                    const answer = response.answers[qId];
                    if (answer && answer.trim()) {
                        qStats.answers.push(answer);
                        qStats.totalAnswered++;
                    }
                });
            }

            stats.questions[qId] = qStats;
        });

        return stats;
    }

    function filterResponses(surveyId, filters) {
        const responses = getSurveyResponses(surveyId);
        if (!filters || Object.keys(filters).length === 0) {
            return responses;
        }

        return responses.filter(response => {
            for (const qId in filters) {
                const filter = filters[qId];
                const answer = response.answers[qId];

                if (filter.type === 'equals') {
                    if (Array.isArray(answer)) {
                        if (!answer.includes(filter.value)) return false;
                    } else {
                        if (answer !== filter.value) return false;
                    }
                } else if (filter.type === 'contains') {
                    if (Array.isArray(answer)) {
                        if (!answer.some(a => a.includes(filter.value))) return false;
                    } else {
                        if (!answer || !answer.includes(filter.value)) return false;
                    }
                }
            }
            return true;
        });
    }

    function exportToCSV(surveyId, responses) {
        const survey = getSurvey(surveyId);
        if (!survey) return null;

        const headers = ['提交时间', ...survey.questions.map(q => q.title)];
        const rows = responses.map(response => {
            const row = [new Date(response.submittedAt).toLocaleString('zh-CN')];
            survey.questions.forEach(question => {
                const answer = response.answers[question.id];
                if (answer === undefined || answer === null || answer === '') {
                    row.push('');
                } else if (Array.isArray(answer)) {
                    row.push(answer.join('; '));
                } else if (typeof answer === 'object') {
                    row.push(Object.entries(answer).map(([k, v]) => `${k}:${v}`).join('; '));
                } else {
                    row.push(String(answer));
                }
            });
            return row;
        });

        const csvContent = [
            headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        return '\uFEFF' + csvContent;
    }

    function createQuestion(type) {
        const id = generateId();
        const base = {
            id,
            type,
            title: '',
            required: false,
            logic: []
        };

        switch (type) {
            case 'single':
                return { ...base, options: ['选项1', '选项2', '选项3'] };
            case 'multiple':
                return { ...base, options: ['选项1', '选项2', '选项3'] };
            case 'dropdown':
                return { ...base, options: ['选项1', '选项2', '选项3'] };
            case 'text':
                return { ...base, placeholder: '请输入您的答案' };
            case 'rating':
                return { ...base, maxRating: 5 };
            case 'matrix':
                return {
                    ...base,
                    rows: ['行1', '行2', '行3'],
                    columns: ['列1', '列2', '列3']
                };
            default:
                return base;
        }
    }

    function getSurveyStatus(survey) {
        const now = Date.now();
        const count = getResponseCount(survey.id);

        if (survey.settings.endTime && now > new Date(survey.settings.endTime).getTime()) {
            return { status: 'ended', label: '已结束' };
        }
        if (survey.settings.startTime && now < new Date(survey.settings.startTime).getTime()) {
            return { status: 'pending', label: '未开始' };
        }
        if (survey.settings.maxResponses > 0 && count >= survey.settings.maxResponses) {
            return { status: 'full', label: '已满员' };
        }
        return { status: 'active', label: '进行中' };
    }

    function canTakeSurvey(survey, passwordInput = '') {
        const status = getSurveyStatus(survey);
        if (status.status !== 'active') {
            return { can: false, reason: status.label };
        }
        if (survey.settings.password && survey.settings.password !== passwordInput) {
            return { can: false, reason: '密码错误' };
        }
        return { can: true };
    }

    function getShareUrl(surveyId) {
        const baseUrl = window.location.origin + window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
        return baseUrl + 'survey.html?id=' + surveyId;
    }

    function getEmbedCode(surveyId) {
        const url = getShareUrl(surveyId);
        return `<iframe src="${url}" width="100%" height="600" frameborder="0" allowfullscreen></iframe>`;
    }

    function initSampleData() {
        const initialized = localStorage.getItem('survey_initialized');
        if (initialized) return;

        const q1Id = 'sample_q1';
        const q2Id = 'sample_q2';
        const q3Id = 'sample_q3';
        const q4Id = 'sample_q4';
        const q5Id = 'sample_q5';
        const q6Id = 'sample_q6';

        const sampleSurvey = {
            id: 'sample_survey_001',
            title: '用户满意度调查问卷',
            description: '感谢您参与本次调查，您的反馈对我们非常重要！问卷大约需要3分钟完成。',
            questions: [
                {
                    id: q1Id,
                    type: 'single',
                    title: '您的性别是？',
                    required: true,
                    options: ['男', '女', '其他'],
                    logic: [
                        { operator: 'equals', value: '其他', action: 'show', target: q6Id }
                    ]
                },
                {
                    id: q2Id,
                    type: 'single',
                    title: '您的年龄段是？',
                    required: true,
                    options: ['18岁以下', '18-25岁', '26-35岁', '36-45岁', '46岁以上'],
                    logic: []
                },
                {
                    id: q3Id,
                    type: 'multiple',
                    title: '您是通过哪些渠道了解到我们的产品的？（可多选）',
                    required: false,
                    options: ['朋友推荐', '社交媒体', '搜索引擎', '广告投放', '线下活动', '其他'],
                    logic: []
                },
                {
                    id: q4Id,
                    type: 'rating',
                    title: '请为我们的产品整体满意度打分',
                    required: true,
                    maxRating: 5,
                    logic: []
                },
                {
                    id: q5Id,
                    type: 'text',
                    title: '您对我们的产品有什么建议或意见？',
                    required: false,
                    placeholder: '请输入您的宝贵建议...',
                    logic: []
                },
                {
                    id: q6Id,
                    type: 'dropdown',
                    title: '您最常使用我们的哪项功能？',
                    required: false,
                    options: ['数据分析', '报表生成', '用户管理', '系统设置', '其他'],
                    logic: []
                }
            ],
            settings: {
                startTime: null,
                endTime: null,
                maxResponses: 0,
                password: '',
                allowModify: false
            },
            createdAt: Date.now() - 86400000 * 7,
            updatedAt: Date.now()
        };

        const sampleResponses = [
            {
                id: 'sample_r1',
                surveyId: 'sample_survey_001',
                answers: {
                    [q1Id]: '男',
                    [q2Id]: '26-35岁',
                    [q3Id]: ['朋友推荐', '社交媒体'],
                    [q4Id]: 5,
                    [q5Id]: '产品很好用，界面也很美观。希望能增加更多自定义功能。',
                    [q6Id]: '数据分析'
                },
                submittedAt: Date.now() - 86400000 * 5
            },
            {
                id: 'sample_r2',
                surveyId: 'sample_survey_001',
                answers: {
                    [q1Id]: '女',
                    [q2Id]: '18-25岁',
                    [q3Id]: ['搜索引擎', '广告投放'],
                    [q4Id]: 4,
                    [q5Id]: '整体不错，希望加载速度能更快一些。',
                    [q6Id]: '报表生成'
                },
                submittedAt: Date.now() - 86400000 * 4
            },
            {
                id: 'sample_r3',
                surveyId: 'sample_survey_001',
                answers: {
                    [q1Id]: '男',
                    [q2Id]: '36-45岁',
                    [q3Id]: ['朋友推荐'],
                    [q4Id]: 5,
                    [q5Id]: '',
                    [q6Id]: '用户管理'
                },
                submittedAt: Date.now() - 86400000 * 3
            },
            {
                id: 'sample_r4',
                surveyId: 'sample_survey_001',
                answers: {
                    [q1Id]: '女',
                    [q2Id]: '26-35岁',
                    [q3Id]: ['社交媒体', '线下活动'],
                    [q4Id]: 3,
                    [q5Id]: '功能还可以，但价格有点贵。',
                    [q6Id]: '数据分析'
                },
                submittedAt: Date.now() - 86400000 * 2
            },
            {
                id: 'sample_r5',
                surveyId: 'sample_survey_001',
                answers: {
                    [q1Id]: '男',
                    [q2Id]: '46岁以上',
                    [q3Id]: ['广告投放'],
                    [q4Id]: 4,
                    [q5Id]: '界面简洁明了，容易上手。',
                    [q6Id]: '系统设置'
                },
                submittedAt: Date.now() - 86400000 * 1
            },
            {
                id: 'sample_r6',
                surveyId: 'sample_survey_001',
                answers: {
                    [q1Id]: '女',
                    [q2Id]: '18-25岁',
                    [q3Id]: ['朋友推荐', '社交媒体', '搜索引擎'],
                    [q4Id]: 5,
                    [q5Id]: '非常喜欢！希望能推出更多新功能。',
                    [q6Id]: '报表生成'
                },
                submittedAt: Date.now() - 3600000 * 12
            },
            {
                id: 'sample_r7',
                surveyId: 'sample_survey_001',
                answers: {
                    [q1Id]: '男',
                    [q2Id]: '26-35岁',
                    [q3Id]: ['其他'],
                    [q4Id]: 2,
                    [q5Id]: '有些功能不太好找，希望能优化一下导航。',
                    [q6Id]: '其他'
                },
                submittedAt: Date.now() - 3600000 * 6
            },
            {
                id: 'sample_r8',
                surveyId: 'sample_survey_001',
                answers: {
                    [q1Id]: '女',
                    [q2Id]: '36-45岁',
                    [q3Id]: ['朋友推荐', '广告投放'],
                    [q4Id]: 4,
                    [q5Id]: '',
                    [q6Id]: '用户管理'
                },
                submittedAt: Date.now() - 3600000 * 2
            }
        ];

        saveSurveys([sampleSurvey]);
        saveResponses(sampleResponses);
        localStorage.setItem('survey_initialized', 'true');
    }

    return {
        generateId,
        getSurveys,
        getSurvey,
        createSurvey,
        updateSurvey,
        deleteSurvey,
        getResponses,
        getSurveyResponses,
        getResponseCount,
        submitResponse,
        getResponse,
        calculateStats,
        filterResponses,
        exportToCSV,
        createQuestion,
        getSurveyStatus,
        canTakeSurvey,
        getShareUrl,
        getEmbedCode,
        initSampleData
    };
})();
