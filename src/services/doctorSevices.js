import db from '../models/index'
require('dotenv').config()
import _ from 'lodash';
import { asIs } from 'sequelize';
import emailService from './emailService';

const MAX_NUMBER_SCHEDULE = process.env.MAX_NUMBER_SCHEDULE

let getTopDoctorHome = (limitInput) => {
    return new Promise(async (resolve, reject) => {
        try {
            let users = await db.Users.findAll({
                limit: limitInput,
                where: { roleId: 'R2' },
                order: [['createdAt', "DESC"]],
                attributes: {
                    exclude: ['password']
                },
                include: [
                    { model: db.Allcodes, as: 'positionData', attributes: ['valueEn', 'valueVi'] },
                    { model: db.Allcodes, as: 'genderData', attributes: ['valueEn', 'valueVi'] }
                ],
                raw: true,
                nest: true
            })

            resolve({
                errCode: 0,
                data: users
            })
        } catch (e) {
            reject(e)
        }
    })
}

let getAllDoctors = () => {
    return new Promise(async (resolve, reject) => {
        try {
            let doctors = await db.Users.findAll({
                where: { roleId: 'R2' },
                attributes: {
                    exclude: ['password', 'image']
                },
            })

            resolve({
                errCode: 0,
                data: doctors
            })
        } catch (e) {
            reject(e)
        }
    })
}

let checkRequiredFields = (inputData) => {
    let arrFields = ['doctorId', 'contentHTML', 'contentMarkdown', 'action', 'selectedPrice',
        'selectedPayment', 'selectedProvince', 'nameClinic', 'addressClinic',
        'note', 'specialtyId'
    ]
    let isValid = true
    let element = ''
    for (let i = 0; i < arrFields.length; i++) {
        if (!inputData[arrFields[i]]) {
            isValid = false
            element = arrFields[i]
            break
        }
    }
    return {
        isValid: isValid,
        element: element
    }
}

let saveDetailInfoDoctor = (inputData) => {
    return new Promise(async (resolve, reject) => {
        try {
            let checkObj = checkRequiredFields(inputData)
            if (
                checkObj.isValid === false
            ) {
                resolve({
                    errCode: 1,
                    errMessage: `Missing parameter: ${checkObj.element}`
                })
            } else {
                //upsert to Markdowns
                if (inputData.action === 'CREATE') {
                    await db.Markdowns.create({
                        contentHTML: inputData.contentHTML,
                        contentMarkdown: inputData.contentMarkdown,
                        description: inputData.description,
                        doctorId: inputData.doctorId
                    })
                } else if (inputData.action === 'EDIT') {
                    let doctorMarkdown = await db.Markdowns.findOne({
                        where: { doctorId: inputData.doctorId },
                        raw: false
                    })

                    if (doctorMarkdown) {
                        doctorMarkdown.contentHTML = inputData.contentHTML
                        doctorMarkdown.contentMarkdown = inputData.contentMarkdown
                        doctorMarkdown.description = inputData.description
                        await doctorMarkdown.save()
                    }
                }
                //upsert to Doctor_info
                let doctorInfo = await db.Doctor_Info.findOne({
                    where: {
                        doctorId: inputData.doctorId
                    },
                    raw: false
                })
                if (doctorInfo) {
                    //update
                    doctorInfo.doctorId = inputData.doctorId
                    doctorInfo.priceId = inputData.selectedPrice
                    doctorInfo.provinceId = inputData.selectedProvince
                    doctorInfo.paymentId = inputData.selectedPayment
                    doctorInfo.nameClinic = inputData.nameClinic
                    doctorInfo.addressClinic = inputData.addressClinic
                    doctorInfo.note = inputData.note
                    doctorInfo.specialtyId = inputData.specialtyId
                    doctorInfo.clinicId = inputData.clinicId
                    await doctorInfo.save()
                } else {
                    //create
                    await db.Doctor_Info.create({
                        doctorId: inputData.doctorId,
                        priceId: inputData.selectedPrice,
                        provinceId: inputData.selectedProvince,
                        paymentId: inputData.selectedPayment,
                        nameClinic: inputData.nameClinic,
                        addressClinic: inputData.addressClinic,
                        note: inputData.note,
                        specialtyId: inputData.specialtyId,
                        clinicId: inputData.clinicId
                    })
                }
                resolve({
                    errCode: 0,
                    errMessage: "Save info doctor success!"
                })
            }
        } catch (e) {
            reject(e)
        }
    })
}

let getDetailDoctorById = (inputId) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!inputId) {
                resolve({
                    errCode: 1,
                    errMessage: "Missing required parameter!"
                })
            } else {
                let data = await db.Users.findOne({
                    where: {
                        id: inputId
                    },
                    attributes: {
                        exclude: ['password']
                    },
                    // include: lay thong tin cua Users kem theo thong tin user do trong bang Markdowns
                    include: [
                        {
                            model: db.Markdowns,
                            attributes: ['description', 'contentHTML', 'contentMarkdown']
                        },
                        { model: db.Allcodes, as: 'positionData', attributes: ['valueEn', 'valueVi'] },
                        {
                            model: db.Doctor_Info,
                            attributes: {
                                exclude: ['id', 'doctorId']
                            },
                            include: [
                                { model: db.Allcodes, as: 'priceTypeData', attributes: ['valueEn', 'valueVi'] },
                                { model: db.Allcodes, as: 'provinceTypeData', attributes: ['valueEn', 'valueVi'] },
                                { model: db.Allcodes, as: 'paymentTypeData', attributes: ['valueEn', 'valueVi'] },

                            ]
                        },
                    ],
                    raw: false,
                    nest: true
                })

                if (data && data.image) {
                    data.image = new Buffer(data.image, 'base64').toString('binary')
                }

                if (!data) data = {}

                resolve({
                    errCode: 0,
                    data: data
                })
            }
        } catch (e) {
            reject(e)
        }
    })
}

let bulkCreateSchedule = (data) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!data.arrSchedule || !data.doctorId || !data.formatedDate) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing riquired parameter!'
                })
            } else {
                let schedule = data.arrSchedule

                if (!schedule) {
                    console.log('schedule is empty!')
                } else {
                    schedule = schedule.map(item => {
                        item.maxNumber = MAX_NUMBER_SCHEDULE
                        return item
                    })
                }

                let existing = await db.Schedules.findAll(
                    {
                        where: { doctorId: data.doctorId, date: data.formatedDate },
                        attributes: ['timeType', 'date', 'doctorId', 'maxNumber'],
                        raw: true
                    }
                )

                //check different
                let toCreate = _.differenceWith(schedule, existing, (a, b) => {
                    return a.timeType === b.timeType && +a.date === +b.date
                })

                //create data
                if (toCreate && toCreate.length > 0) {
                    await db.Schedules.bulkCreate(toCreate)
                }

                resolve({
                    errCode: 0,
                    errMessage: 'OK'
                })


            }
        } catch (e) {
            reject(e)
        }
    })
}

let getScheduleByDate = (doctorId, date) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!doctorId || !date) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter!'
                })
            } else {
                let data = await db.Schedules.findAll({
                    where: {
                        doctorId: doctorId,
                        date: date
                    },
                    include: [
                        { model: db.Allcodes, as: 'timeTypeData', attributes: ['valueEn', 'valueVi'] },
                        { model: db.Users, as: 'doctorData', attributes: ['firstName', 'lastName'] },

                    ],
                    raw: false,
                    nest: true
                })

                if (!data) data = []
                resolve({
                    errCode: 0,
                    data: data
                })
            }
        } catch (e) {
            reject(e)
        }
    })
}

let getExtraInfoDoctorById = (doctorId) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!doctorId) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter!'
                })
            } else {
                let data = await db.Doctor_Info.findOne({
                    where: {
                        doctorId: doctorId
                    },
                    attributes: {
                        exclude: ['id', 'doctorId']
                    },
                    include: [
                        { model: db.Allcodes, as: 'priceTypeData', attributes: ['valueEn', 'valueVi'] },
                        { model: db.Allcodes, as: 'provinceTypeData', attributes: ['valueEn', 'valueVi'] },
                        { model: db.Allcodes, as: 'paymentTypeData', attributes: ['valueEn', 'valueVi'] },
                    ],
                    raw: false,
                    nest: true

                })
                if (!data) data = []
                resolve({
                    errCode: 0,
                    data: data
                })
            }
        } catch (e) {
            reject(e)
        }
    })
}

let getProfileDoctorById = (inputId) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!inputId) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter!'
                })
            } else {
                let data = await db.Users.findOne({
                    where: {
                        id: inputId
                    },
                    attributes: {
                        exclude: ['password']
                    },
                    // include: lay thong tin cua Users kem theo thong tin user do trong bang Markdowns
                    include: [
                        {
                            model: db.Markdowns,
                            attributes: ['description', 'contentHTML', 'contentMarkdown']
                        },
                        { model: db.Allcodes, as: 'positionData', attributes: ['valueEn', 'valueVi'] },
                        {
                            model: db.Doctor_Info,
                            attributes: {
                                exclude: ['id', 'doctorId']
                            },
                            include: [
                                { model: db.Allcodes, as: 'priceTypeData', attributes: ['valueEn', 'valueVi'] },
                                { model: db.Allcodes, as: 'provinceTypeData', attributes: ['valueEn', 'valueVi'] },
                                { model: db.Allcodes, as: 'paymentTypeData', attributes: ['valueEn', 'valueVi'] },
                            ]
                        },
                    ],
                    raw: false,
                    nest: true
                })

                if (data && data.image) {
                    data.image = new Buffer(data.image, 'base64').toString('binary')
                }

                if (!data) data = {}

                resolve({
                    errCode: 0,
                    data: data
                })
            }
        } catch (e) {
            reject(e)
        }
    })
}

let getListPaitentForDoctor = (doctorId, date) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!doctorId || !date) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter!'
                })
            } else {
                let data = await db.Bookings.findAll({
                    where: {
                        statusId: 'S2',
                        doctorId: doctorId,
                        date: date
                    },
                    include: [
                        {
                            model: db.Users, as: 'patientData',
                            attributes: ['email', 'firstName', 'address', 'gender'],
                            include: [
                                { model: db.Allcodes, as: 'genderData', attributes: ['valueEn', 'valueVi'] },
                            ]
                        },
                        {
                            model: db.Allcodes, as: 'timeTypeDataPatient', attributes: ['valueEn', 'valueVi']
                        }
                    ],
                    raw: false,
                    nest: true
                })

                resolve({
                    errCode: 0,
                    data: data
                })
            }
        } catch (e) {
            reject(e)
        }
    })
}

let sendRemedy = (data) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!data.email || !data.doctorId || !data.patientId) {
                resolve({
                    errCode: 1,
                    errMessage: 'Missing required parameter!'
                })
            } else {
                //update patient status
                let appointment = await db.Bookings.findOne({
                    where: {
                        doctorId: data.doctorId,
                        patientId: data.patientId,
                        timeType: data.timeType,
                        statusId: 'S2'
                    },
                    raw: false,
                })
                if (appointment) {
                    appointment.statusId = 'S3'
                    await appointment.save()
                }
                //send email remedy
                await emailService.sendAttachment(data)
                resolve({
                    errCode: 0,
                    errMessage: 'OK'
                })
            } 
        } catch (e) {
            reject(e)
        }
    })
}

module.exports = {
    getTopDoctorHome: getTopDoctorHome,
    getAllDoctors: getAllDoctors,
    saveDetailInfoDoctor: saveDetailInfoDoctor,
    getDetailDoctorById: getDetailDoctorById,
    bulkCreateSchedule: bulkCreateSchedule,
    getScheduleByDate: getScheduleByDate,
    getExtraInfoDoctorById: getExtraInfoDoctorById,
    getProfileDoctorById: getProfileDoctorById,
    getListPaitentForDoctor: getListPaitentForDoctor,
    sendRemedy: sendRemedy
}